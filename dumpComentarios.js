
const from = {
  server: '172.26.1.148',
  port: 54302,
  user: 'infoware',
  password: 'Migracion$2024gpaxes',
  database: 'gpa',
  requestTimeout: 180000,
  options: {
    trustServerCertificate: true
  }
}
const to = 'mongodb://gpax2,gpax3/gpax?replicaSet=gpax'
const collection = 'comment'
const collection2 = 'idMigration2'
const query =
  `select * from Comentario where tipoPadre!='Comentario'`

const inicio = new Date()

var mongo = new (require('./mongo.js').Mongo)(to)

function transform(o) {
  var table = o.tipoPadre

  if (['Papel', 'Observacion', 'Informe'].includes(table)) table = table.toLowerCase()
  else if (table === 'Estudio') table = 'project'
  else if (table === 'Fase') table = 'taskf'
  else if (table === 'Actividad') table = 'taska'
  else if (table === 'Procedimiento') table = 'taskp'
  else if (table === 'Accion') table = 'attached'
  else if (table === 'Compromiso') table = 'commitment'
  else if (table === 'Nota') table = 'note'
  else if (table === 'Tarea') table = 'time'
  else if (table === 'Comentario') table = 'comment'

  var collection = table
  if (['papel', 'observacion', 'informe'].includes(table)) collection = 'document'
  else if (['taskf', 'taska', 'taskp'].includes(table)) collection = 'task'
  else if (table === 'time') collection = 'time'
  
  let d = {
    _id: mongo.newId(o.fecha || new Date()).toString(),
    collection: collection,
    document: padreId || '',
    comment: o.nombre + '<br/>' + o.descripcion,
    dateTime: o.fecha || new Date(),
    involved: [],
    mentions: [],
    unread: [],
    migrated: 1,
    user: autorId || ''
  }
  
  return d
}

function update() {
  let pipeline = [
    // Actualizará el proyecto, el modelo, la tarea , el usuario y la unidad
    { $project: { document: 1, plan: 1, project: 1, user: 1 } },
    // Recupera el id del proyecto
    {
      $lookup: {
        from: 'idMigration', let: { idSql: '$project' }, as: 'project', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'project'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { project: { $arrayElemAt: ["$project._id", 0] } } },
    // Recupera el id del documento (procedimientoId = task)
    {
      $lookup: {
        from: 'idMigration', let: { idSql: '$document'}, as: 'document', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'taskp'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { document: { $arrayElemAt: ["$document._id", 0] } } },
    // Recupera el id del plan
    {
      $lookup: {
        from: 'idMigration', let: { idSql: '$plan' }, as: 'plan', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'plan'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { plan: { $arrayElemAt: ["$plan._id", 0] } } },
    // Recupera el id del usuario
    {
      $lookup: {
        from: 'idMigration', let: { idSql: '$user' }, as: 'user', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'user'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { 'user': { $arrayElemAt: ["$user._id", 0] } } },
    { $merge: { into: collection, on: "_id", whenMatched: "merge", whenNotMatched: "insert" } }
  ]
  mongo.aggregate(collection, pipeline, (err, res) => {
    if (err) console.log(err)
    else {
      var dur = (new Date().getTime() - inicio.getTime()) / 1000
      console.log(JSON.stringify(res))
      console.log('Duración total: ' + dur)
      process.exit(0)
    }
  })
}


mongo.client.connect().then(async () => {
  var docs = mongo.db().collection(collection).initializeUnorderedBulkOp()
  var ids = mongo.db().collection(collection2).initializeUnorderedBulkOp()
  const sql = require('mssql')
  const pool = await new sql.ConnectionPool(from).connect()
  const qy = pool.request()
  qy.stream = true // You can set streaming differently for each request
  qy.query(query) // or request.execute(procedure)

  let i = 0
  qy.on('row', data => {
    docs.insert(transform(data))
    ids.insert({ id: data._id, table: 'comment', idSql: data.id })
    i += 1
    if (i > 10) {
      ids.execute()
      ids = mongo.db().collection(collection2).initializeUnorderedBulkOp()
      docs.execute()
      docs = mongo.db().collection(collection).initializeUnorderedBulkOp()
      i = 0
    }
  })
  qy.on('done', () => {
    if (i) {
      ids.execute()
      docs.execute().then(update())
    }
    var dur = (new Date().getTime() - inicio.getTime()) / 1000
    console.log('Duración: ' + dur)
  })
})
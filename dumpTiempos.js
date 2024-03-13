
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
const to = 'mongodb://gpax1/gpax'
//const to = 'mongodb://gpax2,gpax3/gpax?replicaSet=gpax'
const collection = 'time'
const collection2 = 'idMigration'
const query =
  `select t.*, p.nombre as procedimiento, a.nombre as actividad, e.planId as plan1, r.planId as plan2
        from Tarea t
        left join Procedimiento p on(p.id = t.procedimientoId)
        left join Estudio e on(e.id = t.estudioId)
        left join RecursoActividad a on(a.id = t.recursoActividadId)
        left join Recurso r on(r.id = a.recursoId)`

const inicio = new Date()

var mongo = new (require('./mongo.js').Mongo)(to)

function transform(o) {

  let d = {
    _id: mongo.newId(),
    comment: o.descripcion,
    cost: o.costo === null ? 0 : o.costo,
    date: o.fecha,
    dateEnd: '',
    document: o.procedimientoId || '',
    duration: parseInt(Number(o.horas) * 60),
    includeHolidays: '0',
    period: '0',
    plan: o.plan1 || o.plan2 || '',
    project: o.estudioId,
    status: 'draft',
    task: o.procedimientoId ? o.procedimiento : "",
    type: o.procedimientoId ? 'task' : 'activity',
    unit: '',
    user: o.encargadoId
  }

  if (d.task === '') {
    d.activity = o.actividad
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
        from: 'idMigration', let: { idSql: '$document' }, as: 'document', pipeline: [
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
    let doc = transform(data)
    docs.insert(doc)
    ids.insert({ _id: doc._id, table: 'time', idSql: data.id })
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

const from = {
  host: '213.136.85.33',
  port: 3306,
  user: 'gpax',
  password: 'Infoware2000',
  database: 'procomer'
}
const to = 'mongodb://dev1,dev2/prueba02Gabriela?replicaSet=gpaxio'
const collection = 'comment2'
const collection2 = 'idMigration2'
const query =
  `select * from Comentario`

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
    _id: mongo.newId(o.fecha || new Date()),
    collection: collection,
    document: o.padreId || '',
    comment: o.nombre + '<br/>' + o.descripcion,
    dateTime: o.fecha || new Date(),
    involved: [],
    mentions: [],
    unread: [],
    migrated: 1,
    user: o.autorId || ''
  }

  return d
}

function update() {
  let pipeline = [
    { $match: { collection: { $ne: 'comment' } } },
    { $project: { collection: 1, document: 1, user: 1 } },
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
    // Recupera 
    {
      $lookup: {
        from: 'idMigration', let: { idSql: '$document', table: '$collection' }, as: 'document', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', '$$table'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { 'document': { $arrayElemAt: ["$document._id", 0] } } },


    { $merge: { into: collection, on: "_id", whenMatched: "merge", whenNotMatched: "insert" } }
  ]
  mongo.aggregate(collection, pipeline, (err, res) => {
    if (err) console.log(err)
    else {
      pipeline = [
        { $match: { collection: 'comment' } },
        { $sort: { _id: 1 } },
        { $project: { collection: 1, document: 1, user: 1 } },
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
        // Recupera el comentario padre
        {
          $lookup: {
            from: 'idMigration2', let: { idSql: '$document' }, as: 'com', pipeline: [
              { $match: { $expr: { $and: [{ $eq: ['$table', 'comment'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
              { $project: { _id: 1 } }
            ]
          }
        },
        { $addFields: { com: { $arrayElemAt: ["$com._id", 0] } } },
        // Recupera el document y la collection del comentario padre
        {
          $lookup: {
            from: "comment2",
            localField: 'com',
            foreignField: "_id",
            as: "com"
          }
        },
        { $addFields: { document: { $arrayElemAt: ["$com.document", 0] }, collection: { $arrayElemAt: ["$com.collection", 0] }, com: '$$REMOVE' } },
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
  })
}


mongo.client.connect().then(async () => {
  var docs = mongo.db().collection(collection).initializeUnorderedBulkOp()
  var ids = mongo.db().collection(collection2).initializeUnorderedBulkOp()
  const pool = require('mysql2').createConnection(from)
  let qy = pool.query(query).stream()
  let i = 0
  qy.on('data', data => {
    let doc = transform(data)
    docs.insert(doc)
    ids.insert({ _id: doc._id, table: 'comment', idSql: data.id })
    i += 1
    if (i > 10) {
      ids.execute()
      ids = mongo.db().collection(collection2).initializeUnorderedBulkOp()
      docs.execute()
      docs = mongo.db().collection(collection).initializeUnorderedBulkOp()
      i = 0
    }
  })
  qy.on('end', () => {
    if (i) {
      ids.execute()
      docs.execute()//.then(update())
    }
    var dur = (new Date().getTime() - inicio.getTime()) / 1000
    console.log('Duración: ' + dur)
  })
})
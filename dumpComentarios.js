
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
//const to = 'mongodb://gpax1/gpax'
//const to = 'mongodb://gpax2,gpax3/gpax?replicaSet=gpax'
const collection = 'comment'
const collection2 = 'idMigration'
const query =
  `select * from Comentario`

const inicio = new Date()

var mongo = new (require('./mongo.js').Mongo)(to)
var segundos = 1
function transform(o) {
  ++segundos
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

  // Obtener la fecha actual
  var fechaActual = o.fecha || new Date()

  /*// Generar un número aleatorio entre 1 y 59 para los segundos
  var segundosAleatorios = Math.floor(Math.random() * 59) + 1

  // Sumar los segundos aleatorios a la fecha actual
  fechaActual.setSeconds(fechaActual.getSeconds() + segundosAleatorios)

  // Generar un número aleatorio entre 1 y 59 para los minutos
  var minutosAleatorios = Math.floor(Math.random() * 59) + 1

  // Sumar los minutos aleatorios a la fecha actual (que ya tiene los segundos aleatorios agregados)
  fechaActual.setMinutes(fechaActual.getMinutes() + minutosAleatorios)

  // Obtener el desplazamiento de zona horaria actual en minutos
  var offsetActual = fechaActual.getTimezoneOffset()

  // Convertir el desplazamiento de zona horaria a milisegundos
  var offsetEnMilisegundos = offsetActual * 60 * 1000

  // Establecer la nueva zona horaria en GMT-6:00
  var nuevaFecha = new Date(fechaActual.getTime() - offsetEnMilisegundos - (6 * 60 * 60 * 1000));*/

  var idMongo = /*o.fecha ? mongo.newId(o.fecha) :*/ mongo.newId()
  let d = {
    _id: idMongo,
    collection: collection,
    table: table.toLowerCase(),
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
    { $project: { collection: 1, document: 1, user: 1, table: 1 } },
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
        from: 'idMigration', let: { idSql: '$document', table: '$table' }, as: 'document', pipeline: [
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
            from: 'idMigration', let: { idSql: '$document' }, as: 'com', pipeline: [
              { $match: { $expr: { $and: [{ $eq: ['$table', 'comment'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
              { $project: { _id: 1 } }
            ]
          }
        },
        { $addFields: { com: { $arrayElemAt: ["$com._id", 0] } } },
        // Recupera el document y la collection del comentario padre
        {
          $lookup: {
            from: "comment",
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
  const sql = require('mssql')
  const pool = await new sql.ConnectionPool(from).connect()
  const qy = pool.request()
  qy.stream = true // You can set streaming differently for each request
  qy.query(query) // or request.execute(procedure)

  let i = 0
  qy.on('row', data => {
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
  qy.on('done', () => {
    if (i) {
      ids.execute()
      docs.execute().then(update())
    }
    var dur = (new Date().getTime() - inicio.getTime()) / 1000
    console.log('Duración: ' + dur)
  })
})
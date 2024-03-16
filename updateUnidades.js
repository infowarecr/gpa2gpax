
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
const query =
  `select * from Unidad where vencida=1`

const inicio = new Date()

var mongo = new (require('./mongo.js').Mongo)(to)

function update() {
  let pipeline = [
    // Actualizará el proyecto, el modelo, la tarea , el usuario y la unidad
    { $match: { active: false } },
    { $project: { _id: 1, active: 1 } },
    { $merge: { into: 'unit', on: "_id", whenMatched: "merge", whenNotMatched: "insert" } }
  ]
  mongo.aggregate('idMigration', pipeline, (err, res) => {
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
  var docs = mongo.db().collection('idMigration').initializeUnorderedBulkOp()
  const sql = require('mssql')
  const pool = await new sql.ConnectionPool(from).connect()
  const qy = pool.request()
  qy.stream = true // You can set streaming differently for each request
  qy.query(query) // or request.execute(procedure)

  let i = 0
  qy.on('row', data => {
    docs.find({ idSql: data.id, table: 'unit' }).update({ $set: { active: false } })
    i += 1
    if (i > 10) {
      docs.execute()
      docs = mongo.db().collection('idMigration').initializeUnorderedBulkOp()
      i = 0
    }
  })
  qy.on('done', () => {
    if (i) {
      docs.execute().then(update())
    }
    var dur = (new Date().getTime() - inicio.getTime()) / 1000
    console.log('Duración: ' + dur)
  })
})
let from = {
  host: '213.136.85.33',
  port: 3306,
  user: 'gpax',
  password: 'Infoware2000',
  database: 'procomer',
  supportBigNumbers: true,
  bigNumberStrings: true
}
let to = 'mongodb://dev1,dev2/prueba02Gabriela?replicaSet=gpaxio'
var inicio = new Date()
var mongo = new (require('./mongo.js').Mongo)(to)

mongo.client.connect().then(() => {
  var papeles = mongo.db().collection('papeles').initializeUnorderedBulkOp()
  var ids = mongo.db().collection('ids').initializeUnorderedBulkOp()
  const pool = require('mysql2').createConnection(from)
  let qy = pool.query(`select p.*, MIN(px.procedimientoId) as task from Papel p 
  left join PapelXProcedimiento px  on px.papelId = p.id
  group by p.id`).stream()
  let i = 0
  qy.on('data', data => {
    data._id = mongo.newId()
    papeles.insert(data)
    ids.insert({ id: data._id, table: 'papel', idSql: data.id })
    i += 1
    if (i > 10) {
      ids.execute()
      ids = mongo.db().collection('ids').initializeUnorderedBulkOp()
      papeles.execute()
      papeles = mongo.db().collection('papeles').initializeUnorderedBulkOp()
      i = 0
    }
  })
  qy.on('end', () => {
    if (i) {
      ids.execute()
      papeles.execute()
    }
    var dur = (new Date().getTime() - inicio.getTime()) / 1000
    console.log('Duración: ' + dur)
  })
})

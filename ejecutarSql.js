
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
const to = 'mongodb://gpax2,gpax3/gpax?replicaSet=gpax'
/*const query =
  `select e.id from Fase f 
    inner join Actividad a on(a.faseId=f.id) 
    inner join Procedimiento p on(p.actividadId=a.id)
    inner join Estudio e on(e.id=f.estudioId) 
    where f.id in  ( 1, 2, 3, 7942, 7943, 9175, 17323, 17324, 17325 ) 
    or a.id in (1, 2, 3, 11443, 11444, 11445, 11446, 11447, 13802, 13803, 13804, 13805, 13806, 13807, 13808, 13809, 24899, 24900, 24901, 24902, 24903, 24904, 25119, 24905)
    or p.id in ( 1, 2, 3, 20543, 20544, 20545, 20546, 20547, 20548, 20549, 20550, 20551, 20552, 20553, 20554, 20555, 20556, 20557, 20558, 26458, 26459, 26460, 26461, 26462, 26463, 26464, 26465, 26466, 26467, 26468, 26469, 26470, 26471, 26472, 26473, 26474, 26475, 26476, 26477, 26478, 26479, 26480, 26481, 26482, 26483, 26484, 26485, 26486, 26487, 26488, 26489, 26490, 26491, 26492, 26493, 49615, 49616, 49429, 49430, 49431, 49432, 49873, 49874, 49875, 49433 )
    group by e.id`*/
const query =
  `select count(*) 
  from EstudioModelo`

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
  console.log(mongo.toId('65f500ff3c99db44bbc18128').getTimestamp())
  let i = 0
  qy.on('row', data => {
    /*docs.find({ idSql: data.id, table: 'unit' }).update({$set:{active:false}})
    i += 1
    if (i > 10) {
      docs.execute()
      docs = mongo.db().collection('idMigration').initializeUnorderedBulkOp()
      i = 0
    }*/
    console.log(JSON.stringify(data))
  })
  qy.on('done', () => {
    if (i) {
      docs.execute()//.then(update())
    }
    var dur = (new Date().getTime() - inicio.getTime()) / 1000
    console.log('Duración: ' + dur)
  })
})
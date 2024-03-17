
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
const query =
  `select * from EstudioXInvitado`

const inicio = new Date()

var mongo = new (require('./mongo.js').Mongo)(to)

function update() {
  let pipeline = [
    // Recupera el id del projecto
    {
      $lookup: {
        from: 'idMigration', let: { idSql: '$estudioId' }, as: 'project', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'project'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { project: { $arrayElemAt: ["$project._id", 0] } } },

    // Recupera el id del projecto
    {
      $lookup: {
        from: 'idMigration', let: { idSql: '$invitadoId' }, as: 'user', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'user'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { user: { $arrayElemAt: ["$user._id", 0] } } }
  ]
  mongo.aggregate('guests', pipeline, async (err, projects) => {
    if (err) console.log(err)
    else {
      for (let i in projects) {
        let project = projects[i]
        await new Promise(resolve => {
          mongo.findOne('project', { _id: project.project }, { _id: 1, actors:1 }, (err, doc) => {
            doc.actors.push({ user: project.user, type: ['guest'] })
            mongo.save('project', doc, (err, res) => {
              if (err) console.log(err)
              else console.log(JSON.stringify(res))
              resolve()
            })
          })
        })
      }
      console.log('Duración total: ' + dur)
      process.exit(0)
    }
  })
}
mongo.client.connect().then(async () => {
  const sql = require('mssql')
  const pool = await new sql.ConnectionPool(from).connect()
  const qy = pool.request()
  let invitados = await qy.query(query) // or request.execute(procedure)

  mongo.insertMany('guests', invitados.recordset, (err, res) => {
    if (err) console.log(err)
    else console.log(JSON.stringify(res))
    update()
  })
})

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
const collection = 'task2'
const collection2 = 'idMigration2'
const query =
  `select p.*
  from Procedimiento p
  order by p.id`

const inicio = new Date()

var mongo = new (require('./mongo.js').Mongo)(to)

function transform(o) {

  function putStatus(theStatus) {
    let statusx = ''
    let color = ''
    switch (theStatus) {
      case "2": // En proceso
        statusx = 'processing'
        color = '#3c4dc4'
        break
      case "3": // Para revisar
      case "8": // Ejecutado
        statusx = 'done'
        color = '#529B00'
        break
      case "5": // Revisado
        statusx = 'reviewed'
        color = '#529B00'
        break
      case "4": // Concluido
      case "10": // Aprobado
        statusx = 'reviewed'
        color = '#529B00'
        break
      case "7": // Pendiente
        statusx = 'paused'
        color = '#FF963E'
        break
      case "6": // NoAplicado
        statusx = 'suspended'
        color = '#FF413E'
        break
      case "11": // archived
        statusx = 'archived'
        break
      default: // 0 SinEmitir, 1 Emitido, 9 Borrador, otros
        statusx = 'draft'
        break
    }
    return { statusx, color }
  }

  let statusRes = putStatus(o.estado)

  let color = statusRes.color
  let status = statusRes.statusx
  let type = 'task'

  var duration = Number(o.duracion)
  if (duration < 1) {
    duration = 480
  } else {
    duration = (duration * 8) * 60
  }

  let idMongo = mongo.newId()
  let d = {
    _id: idMongo,
    calendar: '',
    checkList: {},
    color: color,
    compliance: '',
    constraint_type: 'asap',
    description: o.descripcion,
    documents: [], //revisar el update para insertar los ids de los documentos
    duration: duration,
    end_date: '',
    id: idMongo,
    lineThrough: '',
    orden: '',
    owner_id: o.encargadoId,
    parent: 0,
    planned_end: '',
    planned_start: '',
    progress: '',
    project: o.actividadId, //buscar la actividad para obtener el project de la actividad
    realProgress: '',
    render: '',
    start_date: 'insertar campo start_date de la actividad',
    status: status,
    text: o.secuencia + " " + o.nombre,
    type: type,
    workDay: 480,
    links: [],
    progressColor: ''
  }

  if (d.task === '') {
    d.activity = o.actividad
  }

  return d
}

function update() {
  let pipeline = [
    { $match: { project: { $type: 'number' } } },
    // Actualizará el responsable, el proyecto, la fechaInicio
    { $project: { owner_id: 1, project: 1, start_date: 1 } },
    // Recupera el id del responsable
    {
      $lookup: {
        from: 'idMigration', let: { idSql: '$owner_id' }, as: 'owner_id', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'user'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { owner_id: { $arrayElemAt: ["$owner_id._id", 0] } } },
    // Recupera el id del projecto
    {
      $lookup: {
        from: 'idMigration2', let: { idSql: '$project' }, as: 'actividad', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'taska'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { parent: { $arrayElemAt: ["$actividad._id", 0] } } },
    {
      $lookup: {
        from: 'task2', let: { idSql: '$parent' }, as: 'actividad', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$_id', '$$idSql'] }] } } },
          { $project: { _id: 1, project: 1, start_date: 1 } }
        ]
      }
    },
    {
      $addFields: {
        project: { $arrayElemAt: ["$actividad.project", 0] },
        start_date: { $arrayElemAt: ["$actividad.start_date", 0] }, actividad: '$$REMOVE'
      }
    },
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
    ids.insert({ _id: doc._id, table: 'taskp', idSql: data.id })
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
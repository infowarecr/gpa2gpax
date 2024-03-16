
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
const collection = 'project'
const collection2 = 'idMigration'
const query =
  `select e.*,
    STUFF((select ',' + CAST(p.participanteId AS VARCHAR(50)) from EstudioXParticipante p where p.estudioId=e.id
    for XML PATH('')), 1, 1, '') AS miembrosP,
    STUFF((select ',' + CAST(u.unidadId AS VARCHAR(50)) from EstudioXUnidad u where u.estudioId=e.id
    for XML PATH('')), 1, 1, '') AS unidadesP,
    STUFF((select ',' + CAST(p.procesoId AS VARCHAR(50)) from EstudioXProceso p where p.estudioId=e.id
    for XML PATH('')), 1, 1, '') AS procesosP,
    (select p.jornada from Persona p where p.usuarioId=e.encargadoId and p.unidadId=e.unidadId) as jornadaEncargado
  from Estudio e
  order by e.id`

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
        statusx = 'completed'
        color = '#529B00'
        break
      case "4": // Concluido
      case "10": // Aprobado
        statusx = 'completed'
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

  var content = {
    data: [],
    links: [],
    autoSchedule: 0
  }

  let files = [
    {
      "id": mongo.newId().toString(),
      "value": "/",
      "open": true,
      "type": "folder",
      "date": new Date(),
      "data": []
    }
  ]

  //planPeriod and startEnd variables
  var elInicio = o.inicio
  var elFin = o.fin
  var elIniciReal = o.inicioReal
  var elFinReal = o.finReal
  var startEnd = ""
  var planPeriod = ['', '']
  var realPeriod = ['', '']

  //startEnd logic cambiar el formato de la fecha a año/mes/dia
  if (o.inicio && o.fin) {
    var dateString = o.inicio.toLocaleString() + '/' + o.fin.toLocaleString()
    // Remove "00:00:00" with or without a space before it
    var cleanedString = dateString.replace(/, ?00:00:00/g, "")

    // Split the input string by the '/'
    var dateComponents = cleanedString.split('/')

    // Extract individual date components for the first date
    var day1 = parseInt(dateComponents[0], 10)
    var month1 = parseInt(dateComponents[1], 10)
    var year1 = parseInt(dateComponents[2], 10)

    // Extract individual date components for the second date
    var day2 = parseInt(dateComponents[3], 10)
    var month2 = parseInt(dateComponents[4], 10)
    var year2 = parseInt(dateComponents[5], 10)

    // Create formatted output string
    startEnd = `${year1}/${month1}/${day1} / ${year2}/${month2}/${day2}`

    planPeriod = [elInicio, elFin]
  }

  if (o.inicioReal) {
    realPeriod = [elIniciReal]
    if (o.finReal) {
      realPeriod = [elIniciReal, elFinReal]
    }
  }

  //building html block for description variable
  var description = '<div>'

  // summary alcance
  if (o.alcance) {
    description += '<details>' +
      '<summary>' + 'Alcance' + '</summary>' +
      '<p>' + o.alcance + '</p>' +
      '</details>'
  }

  // summary justificacion
  if (o.justificacion) {
    description += '<details>' +
      '<summary>' + 'Justificación' + '</summary>' +
      '<p>' + o.justificacion + '</p>' +
      '</details>'
  }

  // summary tipoServicio
  if (o.tipoServicio) {
    description += '<details>' +
      '<summary>' + 'Tipo de Servicio' + '</summary>' +
      '<p>' + o.tipoServicio + '</p>' +
      '</details>'
  }

  // summary solicitante
  if (o.solicitante) {
    description += '<details>' +
      '<summary>' + 'Solicitante' + '</summary>' +
      '<p>' + o.solicitante + '</p>' +
      '</details>'
  }

  // summary categoria
  if (o.categoria) {
    description += '<details>' +
      '<summary>' + 'Categoría' + '</summary>' +
      '<p>' + o.categoria + '</p>' +
      '</details>'
  }

  // summary objetivo
  if (o.objetivo) {
    description += '<details>' +
      '<summary>' + 'Objetivo' + '</summary>' +
      '<p>' + o.objetivo + '</p>' +
      '</details>'
  }

  // summary objetivos
  if (o.objetivos) {
    description += '<details>' +
      '<summary>' + 'Objetivos' + '</summary>' +
      '<p>' + o.objetivos + '</p>' +
      '</details>'
  }

  description += '</div>'
  //end building html block for description variable

  let idMongo = mongo.newId()
  let d = {
    _id: idMongo,
    area: o.area,
    auditable: o.modeloId,
    controls: '',
    description: description,
    duration: o.duracion,
    name: o.nombre,
    plan: o.planId,
    plans: '',
    processes: [],
    project: idMongo,
    result: '',
    sequence: { text: '' },
    status: statusRes.statusx,
    tag: o.tema,
    type: 'recurrent',
    unit: o.unidadId,
    units: [],
    actors: [],
    info: '',
    nameDepartment: '',
    planName: '',
    progress: o.avance || 0,
    risk: '',
    workDay: o.jornadaEncargado ? parseInt(o.jornadaEncargado, 10) * 60 : 480,
    content: content,
    startEnd: startEnd,
    planPeriod: planPeriod,
    realPeriod: realPeriod,
    files: files,
    fechaInicio: o.inicio
  }
  if (o.encargadoId) {
    d.actors.push({
      user: o.encargadoId,
      type: ['manager']
    })
  }
  if (o.miembrosP) {
    let m = o.miembrosP.split(',')
    for (let i in m) {
      d.actors.push({
        user: Number(m[i]),
        type: ['member']
      })
    }
  }
  if (o.unidadesP) {
    let u = o.unidadesP.split(',')
    for (let i in u) {
      d.units.push(Number(u[i]))
    }
  }

  if (o.procesosP) {
    let p = o.procesosP.split(',')
    for (let i in p) {
      d.processes.push(Number(p[i]))
    }
  }

  return d
}

function update() {
  let pipeline = [
    { $sort: { _id: -1 } },
    // Actualizará el proyecto, el modelo, la tarea , el usuario y la unidad
    { $project: { unit: 1, units: 1, plan: 1, auditable: 1, actors: 1 } },
    // Recupera el id de la unidad (departamento)
    {
      $lookup: {
        from: 'idMigration', let: { idSql: '$unit' }, as: 'unit', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'unit'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { unit: { $arrayElemAt: ["$unit._id", 0] } } },
    // Recuepra los ids de las unidades relacionadas
    {
      $lookup: {
        from: 'idMigration', let: { idSql: '$units' }, as: 'units', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'unit'] }, { $in: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { units: "$units._id" } },
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
    // Recupera el id de los actores
    {
      $lookup: {
        from: 'project', let: { id: '$_id' }, as: 'actors', pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$id'] } } },
          { $project: { actors: 1, _id: 0 } },
          { $unwind: '$actors' },
          {
            $lookup: {
              from: 'idMigration', let: { idSql: '$actors.user', type: '$actors.type' }, as: 'actors', pipeline: [
                { $match: { $expr: { $and: [{ $eq: ['$table', 'user'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
                { $project: { user: '$_id', type: '$$type', _id: 0 } }
              ]
            }
          },
          { $group: { _id: null, actors: { $push: { $arrayElemAt: ['$actors', 0] } } } },
        ]
      }
    },
    { $addFields: { actors: { $arrayElemAt: ["$actors.actors", 0] } } },
    // Recupera el id de tag
    {
      $lookup: {
        from: 'params', let: { tag: '$tag' }, as: 'tag', pipeline: [
          { $match: { $expr: { $eq: ['$name', 'projectTag'] } } },
          { $unwind: '$options' },
          { $replaceRoot: { newRoot: '$options' } },
          { $match: { $expr: { $eq: ['$value', '$$tag'] } } },
          { $project: { id: 1 } }
        ]
      }
    },
    { $addFields: { tag: [{ $arrayElemAt: ["$tag.id", 0] }] } },
    // Recupera el id del area
    {
      $lookup: {
        from: 'params', let: { tag: '$area' }, as: 'area', pipeline: [
          { $match: { $expr: { $eq: ['$name', 'area'] } } },
          { $unwind: '$options' },
          { $replaceRoot: { newRoot: '$options' } },
          { $match: { $expr: { $eq: ['$value', '$$tag'] } } },
          { $project: { id: 1 } }
        ]
      }
    },
    { $addFields: { area: { $arrayElemAt: ["$area.id", 0] } } },
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
    ids.insert({ _id: doc._id, table: 'project', idSql: data.id })
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
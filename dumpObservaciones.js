var js2x = require('xml-js')


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
const collection = 'document2'
const collection2 = 'idMigration2'
const query =
  `select p.*, m.contenido as contenido, 
    (select top 1 pp.procedimientoId from ObservacionXProcedimiento pp where pp.observacionId = p.id order by pp.observacionId) as procedimientoId,
    (select top 1 uu.unidadId from UnidadXUsuario uu where uu.usuarioId = p.encargadoId order by uu.usuarioId) as unidadId
  from Observacion p left join Modelo m on p.modeloId = m.id`

const inicio = new Date()

var mongo = new (require('./mongo.js').Mongo)(to)

function transform(o) {
  let d = {
    _id: mongo.newId().toString(),
    name: o.nombre,
    content: o.descripcion,
    type: 'redactor',
    project: o.estudioId,
    actors: [{
      user: o.encargadoId,
      path: 'sent',
      role: 'reviser',
      unit: o.unidadId
    }],
    template: o.modeloId,
    pageType: '',
    sequence: { "text": "" },
    task: o.procedimientoId,
    tags: [],
  }
  
  if (o.papelOk) {
    d.status = 'ready'
  } else {
    switch (o.estado * 1) {
      case 0:
      case 1:
      case 9: // SinEmitir, Emitido,Borrador
        d.status = 'draft'
        break
      case 2: // En proceso
        d.status = 'processing'
        break
      case 3: // Para revisar
      case 8: // Ejecutado
        d.status = 'done'
        break
      case 5: // Revisado
        d.status = 'reviewed'
        break
      case 4: // Concluido
      case 10: // Aprobado
        d.status = 'completed'
        break
      case 7: // Pendiente
        d.status = 'paused'
        break
      case 6: // NoAplicado
        d.status = 'suspended'
        break
      case 11: // archived
        d.status = 'archived'
        break
    }
  }

  if (o.descripcion) {
    d.content = d.content + "<details open=''><summary>Condición</summary>" + o.descripcion + '</details><br>'
  }
  if (o.causa) {
    d.content = d.content + "<details open=''><summary>Causa</summary>" + o.causa + '</details><br>'
  }
  if (o.efecto) {
    d.content = d.content + "<details open=''><summary>Efecto</summary>" + o.efecto + '</details><br>'
  }
  if (o.recomendacion) {
    d.content = d.content + "<details open=''><summary>Recomendación</summary>" + o.recomendacion + '</details><br>'
  }
  if (o.criterios) {
    d.content = d.content + "<details open=''><summary>Criterios</summary>" + o.criterios + '</details><br>'
  }
  if (o.entrevistados || o.comentario) {
    d.content = d.content + "<details open=''><summary>Comentarios</summary>" + (o.entrevistados ? o.entrevistados + '<br>' : '') + (o.comentario ? o.comentario + '<br>' : '') + '</details><br>'
  }
  if (o.tratamiento || o.justificacion) {
    d.content = d.content + "<details open=''><summary>Tratamiento</summary>" + (o.tratamiento ? o.tratamiento + '<br>' : '') + (o.justificacion ? o.justificacion + '<br>' : '') + '</details><br>'
  }
  if (o.recomendacionesPrevias) {
    d.content = d.content + "<details open=''><summary>Recomendaciones Previas</summary>" + o.recomendacionesPrevias + '</details><br>'
  }
  return d
}
function update() {
  let pipeline = [
    // Actualizará el proyecto, el modelo, la tarea , el usuario y la unidad
    { $project: { project: 1, template: 1, task: 1, actors: 1 } },
    // Recupera el id del proyecto
    {
      $lookup: {
        from: collection2, let: { idSql: '$project' }, as: 'project', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'project'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { project: { $arrayElemAt: ["$project._id", 0] } } },
    // Recupera el id del modelo (modeloId => template)
    {
      $lookup: {
        from: collection2, let: { idSql: '$template' }, as: 'template', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'templateObservacion'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { template: { $arrayElemAt: ["$template._id", 0] } } },
    // Recupera el id de la tarea (procedimientoId => task)
    {
      $lookup: {
        from: collection2, let: { idSql: '$task' }, as: 'task', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'taskp'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { task: { $arrayElemAt: ["$task._id", 0] } } },
    // Recupera el id del usuario
    {
      $lookup: {
        from: collection2, let: { idSql: { $arrayElemAt: ['$actors.user', 0] } }, as: 'user', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'user'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { 'actors.user': { $arrayElemAt: ["$user._id", 0] } } },
    // Recupera el id de la unidad
    {
      $lookup: {
        from: collection2, let: { idSql: { $arrayElemAt: ['$actors.unit', 0] } }, as: 'unit', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'unit'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { 'actors.unit': { $arrayElemAt: ["$unit._id", 0] }, user: '$$REMOVE', unit: '$$REMOVE' } },
    //{ $merge: { into: collection, on: "_id", whenMatched: "merge", whenNotMatched: "insert" } }
    { $limit:10}
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
  //update()
  //return
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
    ids.insert({ id: data._id, table: collection, idSql: data.id })
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
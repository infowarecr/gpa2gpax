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
    (select top 1 pp.procedimientoId from PapelXProcedimiento pp where pp.papelId = p.id order by pp.papelId) as procedimientoId,
    (select top 1 uu.unidadId from UnidadXUsuario uu where uu.usuarioId = p.encargadoId order by uu.usuarioId) as unidadId
  from Papel p left join Modelo m on p.modeloId = m.id`

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
    tags: [o.tema]
  }
  var contenido = o.contenido || '<contenido/>'
  var checkeds = []
  if (o.listaChequeo) {
    checkeds = o.listaChequeo.split(',')
  }
  var ht = ''
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

  switch (o.corte * 1) {
    case 1:
      if (o.corteReal) {
        ht = '<span>Fecha: ' + o.corteReal.toLocaleDateString() + ' </span><br>'
        d.content = ht + d.content
      }
      break
    case 2:
      if (o.corteInicio && o.corteFin) {
        ht = '<span>Periodo: ' + o.corteInicio.toLocaleDateString() + ' - ' + o.corteFin.toLocaleDateString() + ' </span><br>'
        d.content = ht + d.content
      }
      break
  }

  var body
  try {
    body = js2x.xml2js(contenido)
  } catch (e) {
    body = ''
  }

  if (body && body.contenido && body.contenido.ListaChequeo && body.contenido.ListaChequeo._text) {
    contenido = body.contenido.ListaChequeo._text
    contenido = contenido._ ? contenido._ : contenido
    let cks = js2x.xml2js(contenido)
    var html = ''
    if (cks && (cks.ol || cks.ul)) {
      cks.ul = cks.ul || cks.ol
      html = "<details open=''><summary>Listachequeo</summary>"
      for (let i in cks.ul.li) {
        if (checkeds[i] === 1) { html += "<input type='checkbox' name='listaChequeo' value=" + cks.ul.li[i] + ' checked>' + cks.ul.li[i] + '<br>' } else { html += "<input type='checkbox' name='listaChequeo' value=" + cks.ul.li[i] + '>' + cks.ul.li[i] + '<br>' }
      }
      html += '</details><br>'
    }
    d.content = html + d.content
  }
  return d
}
function update() {
  let pipeline = [
    // Actualizará el proyecto, el modelo, la tarea , el usuario y la unidad
    { $project: { project: 1, template: 1, task: 1, actors: 1 } },
    // Recupera el id del tag
    {
      $lookup: {
        from: 'params', let: { tag: { $arrayElemAt: ['$tags', 0] } }, as: 'tags', pipeline: [
          { $match: { $expr: { $eq: ['$name', 'tag'] } } },
          { $unwind: '$options' },
          { $replaceRoot:{newRoot:'$options'}},
          { $match: {$expr:{$eq:['$value','$$tag']}}},
          { $project: { id: 1 } }
        ]
      }
    },
    //{ $addFields: { tags: { $arrayElemAt: ["$tagst._id", 0] } } },
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
          { $match: { $expr: { $and: [{ $eq: ['$table', 'templateFormulario'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
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
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
//const to = 'mongodb://gpax1/gpax'
const to = 'mongodb://gpax2,gpax3/gpax?replicaSet=gpax'
const collection = 'document'
const collection2 = 'idMigration'
const query =
  `select p.*, m.contenido as contenido, 
    (select top 1 pp.procedimientoId from InformeXProcedimiento pp where pp.informeId = p.id order by pp.informeId) as procedimientoId,
    (select top 1 uu.unidadId from UnidadXUsuario uu where uu.usuarioId = p.encargadoId order by uu.usuarioId) as unidadId
  from Informe p left join Modelo m on p.modeloId = m.id`

const inicio = new Date()

var mongo = new (require('./mongo.js').Mongo)(to)

function transform(o) {
  let d = {
    _id: mongo.newId(),
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
    templateName: 'templateInforme',
    pageType: '',
    sequence: { "text": "" },
    task: o.procedimientoId,
    tags: [o.tema],
    tipo: 'informe'
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

  if (o.final === '1') {
    d.content = '<span>Informe final</span><br>'
  }
  if (o.descripcion) {
    d.content = d.content + "<details open=''><summary>Introducción</summary>" + o.descripcion + '</details><br>'
  }

  if (o.resumen) {
    d.content = d.content + "<details open=''><summary>Resumen ejecutivo</summary>" + o.resumen + '</details><br>'
  }
  if (o.conclusion) {
    d.content = d.content + "<details open=''><summary>Conclusión</summary>" + o.conclusion + '</details><br>'
  }

  if (o.periodo || o.limitaciones || o.sugerencias || o.comentarios) {
    d.content = d.content + "<details open=''><summary>Otros datos</summary>" +
      (o.periodo
        ? '<fieldset>' +
        '<legend>Periodo:</legend>' +
        o.entrevistados + '<br>' +
        '</fieldset>'
        : '') +
      (o.limitaciones
        ? '<fieldset>' +
        '<legend>Limitaciones:</legend>' +
        o.limitaciones + '<br>' +
        '</fieldset>'
        : '') +
      (o.periodo
        ? '<fieldset>' +
        '<legend>Periodo:</legend>' +
        o.periodo + '<br>' +
        '</fieldset>'
        : '') +
      (o.sugerencias
        ? '<fieldset>' +
        '<legend>Sugerencias:</legend>' +
        o.sugerencias + '<br>' +
        '</fieldset>'
        : '') +
      (o.comentarios
        ? '<fieldset>' +
        '<legend>Sugerencias:</legend>' +
        o.comentarios + '<br>' +
        '</fieldset>'
        : '')
  }
  return d
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
    ids.insert({ _id: doc._id, table: 'informe', idSql: data.id })
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
      docs.execute()
    }
    var dur = (new Date().getTime() - inicio.getTime()) / 1000
    console.log('Duración: ' + dur)
  })
})
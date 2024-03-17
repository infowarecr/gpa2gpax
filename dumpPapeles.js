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
    (select top 1 pp.procedimientoId from PapelXProcedimiento pp where pp.papelId = p.id order by pp.papelId) as procedimientoId,
    (select top 1 uu.unidadId from UnidadXUsuario uu where uu.usuarioId = p.encargadoId order by uu.usuarioId) as unidadId
  from Papel p left join Modelo m on p.modeloId = m.id`

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
    templateName: 'templatePapel',
    pageType: '',
    sequence: { "text": "" },
    task: o.procedimientoId,
    tags: [o.tema],
    tipo:'papel'
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
    ids.insert({ _id: doc._id, table: 'papel', idSql: data.id })
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
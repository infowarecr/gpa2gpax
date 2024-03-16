const to = 'mongodb://gpax1/gpax'
//const to = 'mongodb://gpax2,gpax3/gpax?replicaSet=gpax'
const inicio = new Date()

var mongo = new (require('./mongo.js').Mongo)(to)

function refs(ref) {
  var files = [
    {
      id: mongo.newId(),
      value: "/",
      open: true,
      type: "folder",
      date: new Date(),
      data: []
    }
  ]
  var references = []
  ref.docs.forEach(doc => {
    let html = `<table>
                  <thead>
                    <tr>
                      <th><strong>Archivos adjuntos migrados</strong></th>
                    </tr>
                  </thead>
                <tbody>`
    doc.files.forEach(file => {
      let type = file.file.split('.')
      type = type.length == 2 ? type[1].toLowerCase() : ''
      html += `<tr><td><a href="/api/file.get?_id=${file.id}&type=${type}" type="${type}" value="${file.file}">${file.file}</a></td></tr>`
      files[0].data.push({
        id: `/api/file.get?_id=${file.id}&type=${type}`,
        value: file.file,
        type: type,
        size: file.size,
        date: new Date(),
        reference: `/api/file.get?_id=${file.id}&type=${type}`,
        recent: new Date()
      })
    })
    html += '</tbody></table > '
    references.push({ _id: doc.id, references: html })
  })
  return { files: files, docs: references }
}
mongo.client.connect().then(async () => {
  var procs = mongo.db().collection('project').initializeUnorderedBulkOp()
  var docs = mongo.db().collection('document').initializeUnorderedBulkOp()
  var files = mongo.db().collection('filesXproject').initializeUnorderedBulkOp()

  const qy = mongo.db().collection('filesXproject').find({ linked: { $ne: true } }).stream()

  let i = 0
  qy.on('data', data => {
    let doc = refs(data)
    files.find({ _id: data._id }).update({ $set: { linked: true } })
    procs.find({ _id: data._id }).update({ $set: { files: doc.files } })
    doc.docs.forEach(ref => {
      docs.find({ _id: ref._id }).update([{ $set: { content: { $concat: [ref.references, '$content'] } } }])
    })
    i += 1
    if (i > 10) {
      procs.execute()
      procs = mongo.db().collection('project').initializeUnorderedBulkOp()
      files.execute()
      files = mongo.db().collection('filesXproject').initializeUnorderedBulkOp()
      docs.execute()
      docs = mongo.db().collection('document').initializeUnorderedBulkOp()
      i = 0
    }
  })
  qy.on('end', () => {
    if (i) {
      procs.execute()
      files.execute()
      docs.execute()
    }
    var dur = (new Date().getTime() - inicio.getTime()) / 1000
    console.log('Duración: ' + dur)
  })
})
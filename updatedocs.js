//const to = 'mongodb://gpax1/gpax'
const to = 'mongodb://gpax2,gpax3/gpax?replicaSet=gpax'
const collection = 'document'
const collection2 = 'idMigration'

const inicio = new Date()

var mongo = new (require('./mongo.js').Mongo)(to)

function update() {
  let pipeline = [
    // Actualizará el proyecto, el modelo, la tarea , el usuario y la unidad
    { $project: { project: 1, template: 1, task: 1, actors: 1, templateName: 1 } },
    // Recupera el id del proyecto
    {
      $lookup: {
        from: 'idMigration', let: { idSql: '$project' }, as: 'project', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'project'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { project: { $arrayElemAt: ["$project._id", 0] } } },
    // Recupera el id del tag
    {
      $lookup: {
        from: 'params', let: { tag: { $arrayElemAt: ['$tags', 0] } }, as: 'tags', pipeline: [
          { $match: { $expr: { $eq: ['$name', 'tag'] } } },
          { $unwind: '$options' },
          { $replaceRoot: { newRoot: '$options' } },
          { $match: { $expr: { $eq: ['$value', '$$tag'] } } },
          { $project: { id: 1 } }
        ]
      }
    },
    { $addFields: { tags: [{ $arrayElemAt: ["$tags.id", 0] }] } },
    // Recupera el id del modelo (modeloId => template)
    {
      $lookup: {
        from: 'idMigration', let: { idSql: '$template', templateName: '$templateName', }, as: 'template', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', '$$templateName'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { template: { $arrayElemAt: ["$template._id", 0] } } },
    // Recupera el id de la tarea (procedimientoId => task)
    {
      $lookup: {
        from: 'idMigration', let: { idSql: '$task' }, as: 'task', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'taskp'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { task: { $arrayElemAt: ["$task._id", 0] } } },
    // Recupera el id del usuario
    {
      $lookup: {
        from: 'idMigration', let: { idSql: { $arrayElemAt: ['$actors.user', 0] } }, as: 'user', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'user'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { 'actors.user': { $arrayElemAt: ["$user._id", 0] } } },
    // Recupera el id de la unidad
    {
      $lookup: {
        from: 'idMigration', let: { idSql: { $arrayElemAt: ['$actors.unit', 0] } }, as: 'unit', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'unit'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { 'actors.unit': { $arrayElemAt: ["$unit._id", 0] }, user: '$$REMOVE', unit: '$$REMOVE' } },
    { $merge: { into: collection, on: "_id", whenMatched: "merge", whenNotMatched: "insert" } }
    //{ $limit: 10 }
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
  mongo.db().collection(collection2).createIndex({ idSql: 1, table: 1 }, { name: "ids" })
  update()
  return

})
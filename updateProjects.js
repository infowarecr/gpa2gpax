//const to = 'mongodb://gpax1/gpax'
const to = 'mongodb://gpax2,gpax3/gpax?replicaSet=gpax'
const collection = 'project'
const collection2 = 'idMigration'

const inicio = new Date()

var mongo = new (require('./mongo.js').Mongo)(to)

function update() {
  let pipeline = [
    { $match: { plan: { $type: 'number' } } },
    { $limit: 500 },
    // Actualizará el proyecto, el modelo, la tarea , el usuario y la unidad
    { $project: { unit: 1, units: 1, plan: 1, auditable: 1, actors: 1 } },
    // Recupera el id del auditable
    {
      $lookup: {
        from: 'idMigration', let: { idSql: '$auditable' }, as: 'auditable', pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$table', 'templateProject'] }, { $eq: ['$idSql', '$$idSql'] }] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { auditable: { $arrayElemAt: ["$auditable._id", 0] } } },
    {
      $lookup: {
        from: 'auditable', let: { idSql: '$auditable' }, as: 'auditable', pipeline: [
          { $match: { $expr: { $eq: ['$project', '$$idSql'] } } },
          { $project: { _id: 1 } }
        ]
      }
    },
    { $addFields: { auditable: { $arrayElemAt: ["$auditable._id", 0] } } },
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
    { $merge: { into: collection, on: "_id", whenMatched: "merge", whenNotMatched: "insert" } }
    //{$out:'projectUpdate'}
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
  update()

})
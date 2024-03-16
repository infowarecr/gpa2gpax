const to = 'mongodb://gpax1/gpax'
//const to = 'mongodb://gpax2,gpax3/gpax?replicaSet=gpax'
const inicio = new Date()

var mongo = new (require('./mongo.js').Mongo)(to)

var pipeline = [
  { $match: { filename: /(Papel|Observacion|Informe)\// } },
  { $project: { filename: { $split: ["$filename", "/"] }, length: 1 } },
  {
    $project: {
      type: { $toLower: { $arrayElemAt: ["$filename", 2] } },
      id: { $toInt: { $arrayElemAt: ["$filename", 3] } },
      file: { $arrayElemAt: ["$filename", 4] },
      length: 1
    }
  },
  {
    $group: {
      _id: { idSql: '$id', table: '$type' },
      files: { $push: { id: '$_id', file: '$file', size: '$length' } }
    }
  },
  { $project: { files: 1, idSql: '$_id.idSql', table: '$_id.table', _id: 0 } },
  {
    $lookup: {
      from: "idMigration", let: { table: '$table', idSql: '$idSql' },
      pipeline: [
        {
          $match:
          {
            $expr: {
              $and: [
                { $eq: ['$idSql', '$$idSql'] },
                { $eq: ['$table', '$$table'] }
              ]
            }
          }
        },
        { $project: { _id: 1, } }
      ],
      as: 'mongo'
    }
  },
  { $project: { files: 1, document: { $arrayElemAt: ["$mongo._id", 0] } } },
  {
    $lookup: {
      from: "document", let: { doc: '$document' },
      as: 'project',
      pipeline: [
        { $match: { $expr: { $eq: ['$_id', '$$doc'] } } },
        { $project: { project: '$project' } }
      ]
    }
  },
  { $unwind: '$project' },
  { $addFields: { project: '$project.project' } },
  { $group: { _id: "$project", docs: { $push: { files: '$files', id: '$document' } } } },
  { $out: 'filesXproject' }
]
mongo.aggregate('fs.files', pipeline, (err, res) => {
  if (err) console.log(err)
  else console.log(JSON.stringify(res))
})
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
{ $addFields: { tags: [{ $arrayElemAt: ["$tags.id", 0] }] } }
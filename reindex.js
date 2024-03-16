
//const to = 'mongodb://gpax1/gpax'
const to = 'mongodb://gpax2,gpax3/gpax?replicaSet=gpax'

var mongoClient = new (require('./mongo.js').Mongo)(to)

mongoClient.client.connect().then(async () => {
  var mongo = mongoClient.db()
  /*await mongo.collection('activity').createIndexes([
    { key: { 'plan': 1 }, name: 'plans' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('alarm').createIndexes([
    { key: { 'actors.user': 1 }, name: 'users' },
    { key: { 'document.id': 1 }, name: 'docs' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('assessment').createIndexes([
    { key: { process: 1 }, name: 'processes' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('attached').createIndexes([
    { key: { 'actors.user': 1 }, name: 'users' },
    { key: { 'actors.unit': 1 }, name: 'units' },
    { key: { reference: 1 }, name: 'notes' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('auditable').createIndexes([
    { key: { unit: 1 }, name: 'department' },
    { key: { units: 1 }, name: 'units' },
    { key: { project: 1 }, name: 'project' },
    { key: { plans: 1 }, name: 'plans' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('auditableAssessment').createIndexes([
    { key: { auditables: 1 }, name: 'auditables' },
    { key: { assessment: 1 }, name: 'assessment' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('bpi').createIndexes([
    { key: { bpd: 1 }, name: 'bpd' },
    { key: { key: 1 }, name: 'entryPoit' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('comment').createIndexes([
    { key: { document: 1 }, name: 'document' },
    { key: { involved: 1 }, name: 'involveds' },
    { key: { mentions: 1 }, name: 'mentions' },
    { key: { unread: 1 }, name: 'unread' },
    { key: { user: 1 }, name: 'user' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('commitment').createIndexes([
    { key: { 'actors.user': 1 }, name: 'users' },
    { key: { 'actors.unit': 1 }, name: 'units' },
    { key: { reference: 1 }, name: 'notes' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('condition').createIndexes([
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('controlAssessment').createIndexes([
    { key: { user: 1 }, name: 'users' },
    { key: { process: 1 }, name: 'process' },
    { key: { assessment: 1 }, name: 'assessment' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('document').createIndexes([
    { key: { 'actors.user': 1 }, name: 'users' },
    { key: { 'actors.unit': 1 }, name: 'units' },
    { key: { project: 1 }, name: 'project' },
    { key: { task: 1 }, name: 'task' },
    { key: { template: 1 }, name: 'template' },
    { key: { tags: 1 }, name: 'tags' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('evidence').createIndexes([
    { key: { 'actors.user': 1 }, name: 'users' },
    { key: { 'actors.unit': 1 }, name: 'units' },
    { key: { reference: 1 }, name: 'commitments' },
    { key: { template: 1 }, name: 'template' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('factor').createIndexes([
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('form').createIndexes([
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('message').createIndexes([
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('note').createIndexes([
    { key: { 'actors.user': 1 }, name: 'users' },
    { key: { 'actors.unit': 1 }, name: 'units' },
    { key: { reference: 1 }, name: 'notes' },
    { key: { project: 1 }, name: 'project' },
    { key: { task: 1 }, name: 'task' },
    { key: { template: 1 }, name: 'template' },
    { key: { tags: 1 }, name: 'tags' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('notification').createIndexes([
    { key: { 'actors.user': 1 }, name: 'users' },
    { key: { 'document.id': 1 }, name: 'docs' },
    { key: { user: 1 }, name: 'user' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('params').createIndexes([
    { key: { name: 1 }, name: 'tag' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('plan').createIndexes([
    { key: { 'goals.projects': 1 }, name: 'projects' },
    { key: { 'goals.objective': 1 }, name: 'objetive' },
    { key: { 'budget.name': 1 }, name: 'budget' },
    { key: { strategy: 1 }, name: 'strategy' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('process').createIndexes([
    { key: { 'risks.selected': 1 }, name: 'risks' },
    { key: { assessment: 1 }, name: 'assessment' },
    { key: { parent: 1 }, name: 'parents' },
    { key: { units: 1 }, name: 'units' },
    { key: { processTag: 1 }, name: 'tags' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('processAssessment').createIndexes([
    { key: { user: 1 }, name: 'user' },
    { key: { process: 1 }, name: 'process' },
    { key: { assessment: 1 }, name: 'assessment' },
    { key: { '$**': 'text' }, name: 'text' }
  ])*/
  await mongo.collection('project').createIndexes([
    { key: { 'actors.user': 1, 'actors.type': 1 }, name: 'users' },
    { key: { unit: 1 }, name: 'deparment' },
    { key: { units: 1 }, name: 'units' },
    { key: { plan: 1 }, name: 'plan' },
    { key: { auditable: 1 }, name: 'auditable' },
    { key: { 'content.data.id': 1 }, name: 'tasks' },
    { key: { processes: 1 }, name: 'processes' },
    { key: { tag: 1 }, name: 'tags' },
    { key: { risk: 1 }, name: 'risk' },
    { key: { status: 1 }, name: 'status' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  /* await mongo.collection('report').createIndexes([
     { key: { '$**': 'text' }, name: 'text' }
   ])
   await mongo.collection('repository').createIndexes([
     { key: { category: 1 }, name: 'category' },
     { key: { source: 1 }, name: 'source' },
     { key: { type: 1 }, name: 'type' },
     { key: { '$**': 'text' }, name: 'text' }
   ])
   await mongo.collection('risk').createIndexes([
     { key: { parent: 1 }, name: 'parents' },
     { key: { type: 1 }, name: 'types' },
     { key: { '$**': 'text' }, name: 'text' }
   ])
   await mongo.collection('riskEvent').createIndexes([
     { key: { process: 1 }, name: 'process' },
     { key: { riskFactor: 1 }, name: 'riskFactor' },
     { key: { unit: 1 }, name: 'units' },
     { key: { user: 1 }, name: 'user' },
     { key: { '$**': 'text' }, name: 'text' }
   ])
   await mongo.collection('rule').createIndexes([
     { key: { '$**': 'text' }, name: 'text' }
   ])
   await mongo.collection('sequence').createIndexes([
     { key: { '$**': 'text' }, name: 'text' }
   ])
   await mongo.collection('server').createIndexes([
     { key: { name: 1 }, name: 'names' },
     { key: { '$**': 'text' }, name: 'text' }
   ])
   await mongo.collection('signal').createIndexes([
     { key: { name: 1 }, name: 'names' },
     { key: { '$**': 'text' }, name: 'text' }
   ])
   await mongo.collection('strategy').createIndexes([
     { key: { 'objectives.id': 1 }, name: 'objectives' },
     { key: { plans: 1 }, name: 'plans' },
     { key: { '$**': 'text' }, name: 'text' }
   ])*/
  await mongo.collection('task').createIndexes([
    { key: { project: 1 }, name: 'projects' },
    { key: { parent: 1 }, name: 'parents' },
    { key: { type: 1 }, name: 'types' },
    { key: { tags: 1 }, name: 'tags' },
    { key: { '$**': 'text' }, name: 'text' }
  ])/*
  await mongo.collection('template').createIndexes([
    { key: { units: 1 }, name: 'units' },
    { key: { type: 1 }, name: 'types' },
    { key: { tags: 1 }, name: 'tags' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('time').createIndexes([
    { key: { user: 1 }, name: 'users' },
    { key: { type: 1 }, name: 'types' },
    { key: { plan: 1 }, name: 'plans' },
    { key: { project: 1 }, name: 'project' },
    { key: { document: 1 }, name: 'document' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('token').createIndexes([
    { key: { company: 1 }, name: 'company' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('trash').createIndexes([
    { key: { user: 1 }, name: 'users' },
    { key: { type: 1 }, name: 'types' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('unit').createIndexes([
    { key: { 'actors.user': 1, 'actors.type': 1 }, name: 'users' },
    { key: { code: 1 }, name: 'codes' },
    { key: { 'sequences._id': 1 }, name: 'sequences' },
    { key: { '$**': 'text' }, name: 'text' }
  ])
  await mongo.collection('unitAssessment').createIndexes([
    { key: { '$**': 'text' }, name: 'text' }
  ])*/
  console.log('Pura vida!!!')
})
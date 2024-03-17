
var tags = require('../utils/tags').tags
var Tree = require('../utils/tree').Tree
var Notification = require('../utils/notification').Notification
var notification = new Notification()

exports.Unit = Unit

function Unit() {
  this.organogram = function (req, mongo, send) {
    mongo.find('unit', {}, { _id: 1, name: 1, actors: 1, parent: 1 }, { name: 1 }, (err, docs) => {
      if (err) {
        send({ error: err })
      } else {
        var ids = []
        for (let i = 0; i < docs.length; ++i) {
          var doc = docs[i]
          if (doc.actors && doc.actors.length > 0) {
            ids.push(doc.actors[0].user)
          }
        }
        mongo.toHash('user', { _id: { $in: ids } }, { _id: 1, name: 1 }, (err, hash) => {
          var units = []
          if (!err) {
            for (let i = 0; i < docs.length; ++i) {
              var doc = docs[i]
              if (doc.actors && doc.actors.length > 0 && hash[doc.actors[0].user.toString()]) {
                var manager = hash[doc.actors[0].user.toString()]
                units.push({
                  key: doc._id.toString(),
                  name: doc.name,
                  manager: manager.name,
                  parent: doc.parent ? doc.parent.toString() : '',
                  photo: 'user.image?itemId=photo&size=45&_id=' + manager._id.toString()
                })
              } else {
                units.push({
                  key: doc._id.toString(),
                  name: doc.name,
                  parent: doc.parent ? doc.parent.toString() : '',
                  photo: 'img/photo.png'
                })
              }
            }
          }
          send({
            id: tags.organizationChart,
            name: tags.organizationChart,
            rows: [{
              view: 'toolbar',
              cols: [
                { view: 'button', type: 'icon', icon: 'save', width: 80, id: tags.save, label: tags.save, click: 'orgchart.save()' },
                { view: 'button', type: 'icon', icon: 'eraser', width: 80, id: tags.discard, label: tags.discard, click: 'orgchart.refresh()' },
                {}
              ]
            }, {
              view: 'orgchart',
              dblclicktooltip: tags.dblClick2AddChild,
              tooltip: tags.edit,
              config: {
                class: 'go.TreeModel',
                nodeDataArray: units
              }
            }]
          })
        })
      }
    })
  }

  this.saveOrgchart = function (req, mongo, send) {
    var units = JSON.parse(req.query.units).nodeDataArray
    if (units && units.length > 0) {
      this.procesar(req, mongo, units, 0, send)
    }
  }

  this.procesar = function (req, mongo, units, i, send) {
    if (units.length > i) {
      var doc = units[i]
      var id = doc.key
      if (doc.deleted === true) {
        mongo.deleteOne('unit', { _id: mongo.toId(id) }, (err, result) => {
          if (err) {
            req.logger.log(err)
          }
          this.procesar(req, mongo, units, i + 1, send)
        })
      } else {
        if (id.length !== 24) {
          id = mongo.newId()
        }
        mongo.save('unit', { _id: id, name: doc.name, parent: doc.parent }, (err, result) => {
          if (err) {
            req.logger.log(err)
          }
          this.procesar(req, mongo, units, i + 1, send)
        })
      }
    } else {
      send({ debug: tags.savedChanges })
    }
  }

  this.get = function (req, mongo, send) {
    var doc = {}
    if (req.query._id) {
      mongo.findId('unit', req.query._id, (err, unit) => {
        if (!err) {
          doc = unit
        } else {
          send()
        }
      })
    }
    if (req.query.createPlans) {
      mongo.findId('unit', req.query._id, (err, unit) => {
        if (!err) {
          doc = unit
        } else {
          send()
        }
      })
    } else {
      doc = { _id: mongo.newId(), name: req.query.name }
      if (req.query.parent) {
        doc.parent = req.query.parent
      }
    }
  }
  this.setParent = function (req, mongo, send) {
    mongo.save('unit', req.body, (err, result) => {
      if (err) send({ error: err })
      else send(req.body)
    })
  }
  this.save = async function (req, mongo, send) {
    var doc = req.body
    var users = []
    var actors = []
    doc.active = doc.active * 1 !== 0
    doc.offline = doc.offline * 1 !== 0
    if (doc.manager) doc.manager = doc.manager.length >= 24 ? doc.manager : doc.manager[0]
    if (doc.$parent && doc.$parent !== '0') {
      doc.parent = doc.$parent
      delete doc.category
    } else {
      doc.parent = doc.parent ? doc.parent : ''
    }
    if (doc.manager) {
      let active = await new Promise(resolve => {
        mongo.find('user', { _id: mongo.toId(doc.manager), active: true }, {}, (err, us) => {
          if (us && us.length) resolve(true)
          else resolve(false)
        })
      })
      if (active) {
        actors.push({
          user: doc.manager,
          type: [tags.manager]
        })
      }
    }
    users.push(mongo.toId(doc.manager))
    var assistants
    if (typeof doc.assistants === 'string') {
      assistants = doc.assistants.length >= 24 ? doc.assistants.split(',') : []
    } else {
      assistants = doc.assistants
    }

    for (const i in assistants) {
      let active = await new Promise(resolve => {
        mongo.find('user', { _id: mongo.toId(assistants[i]), active: true }, {}, (err, us) => {
          if (us && us.length) resolve(true)
          else resolve(false)
        })
      })
      if (active) {
        if (assistants[i] === doc.manager) {
          actors[0].type.push(tags.assistant)
        } else {
          actors.push({ user: assistants[i], type: [tags.assistant] })
          users.push(mongo.toId(assistants[i]))
        }
      }
    }
    var members
    if (typeof doc.members === 'string') {
      members = doc.members.length >= 24 ? doc.members.split(',') : []
    } else {
      members = doc.members
    }
    for (const i in members) {
      if (members[i] !== doc.manager && assistants.indexOf(members[i]) === -1) {
        let active = await new Promise(resolve => {
          mongo.find('user', { _id: mongo.toId(members[i]), active: true }, {}, (err, us) => {
            if (us && us.length) resolve(true)
            else resolve(false)
          })
        })
        if (active) {
          actors.push({ user: members[i], type: [tags.member] })
          users.push(mongo.toId(members[i]))
        }
      }
    }
    mongo.findId('unit', doc._id, { sequences: 1, parent: 1, actors: 1 }, async (err, current) => {
      if (err) throw err

      /***Actlualizar alarmas con cambio de gerente */

      let oldManager = ''
      if (current && current.actors && current.actors.length) {
        for (let i in current.actors) {
          if (current.actors[i].type && current.actors[i].type.includes('manager')) {
            oldManager = current.actors[i].user
          }
        }
      }

      if (oldManager && doc.manager && (oldManager.toString() !== doc.manager.toString())) {
        await new Promise(resolve => {
          mongo.find('reminders', {
            status: 'active', owner: {
              $elemMatch: {
                user: oldManager,
                unit: mongo.toId(doc._id)
              }
            }
          }, {}, async (err, rems) => {
            if (rems && rems.length) {
              for (let r in rems) {
                if (rems[r].owner && rems[r].owner.length) {
                  for (let y in rems[r].owner) {
                    let owner = rems[r].owner[y]
                    if (owner.user.toString() === oldManager.toString()) {
                      owner.user = mongo.toId(doc.manager)
                      owner.unit = mongo.toId(doc._id)
                      break
                    }
                  }
                }
                if (rems[r].deparmentManager && rems[r].deparmentManager.length) {
                  for (let d in rems[r].deparmentManager) {
                    let depart = rems[r].deparmentManager[d]
                    if (depart.toString() === oldManager.toString()) {
                      let index = rems[r].deparmentManager.findIndex(x => {
                        return x.toString() === doc.manager.toString()
                      })
                      if (index === -1) {
                        rems[r].deparmentManager[d] = mongo.toId(doc.manager)
                      } else {
                        rems[r].deparmentManager[d] = mongo.toId(doc.manager)
                        rems[r].deparmentManager.splice(index, 1)
                      }

                      break
                    }
                  }
                }
                await new Promise(resolve => {
                  mongo.save('reminders', rems[r], () => {
                    resolve()
                  })
                })
              }
            }
            resolve()
          })
        })
      }

      /******************************************* */

      if (!doc.updateParent && current && current.parent && doc.parent !== current.parent.toString()) { doc.parent = current.parent.toString() }
      var sequences = []
      sequences = doc.sequences.length >= 24 ? doc.sequences.split(',') : []
      var currentSeqs = current && current.sequences && current.sequences.length > 0 ? current.sequences : []
      doc.sequences = []
      currentSeqs.forEach((ele, x) => { if (ele !== null) { doc.sequences.push(ele) } })
      for (const i in sequences) {
        const pos = doc.sequences.findIndex((seq) => { return seq._id.toString() === sequences[i] })
        if (pos === -1) {
          doc.sequences.push({ _id: sequences[i], exists: 1 })
        } else {
          doc.sequences[pos].exists = 1
        }
      }
      for (let i = doc.sequences.length - 1; i >= 0; --i) {
        if (doc.sequences[i].exists === 1) {
          delete doc.sequences[i].exists
        } else {
          delete doc.sequences[i]
        }
      }
      doc.actors = actors
      /** if the actors are not licensed, the roles are deactivated */
      var ids = []
      for (const i in actors) {
        ids.push(mongo.toId(actors[i].user))
      }
      mongo.find('user', { _id: { $in: ids }, licensedUser: false }, {}, (err, externs) => {
        if (err) throw err
        if (externs && externs.length > 0) {
          doc.createPlans = '0'
          doc.createProjects = '0'
          doc.createStrategies = '0'
        }
        doc._id = mongo.isNativeId(doc.id) ? mongo.toId(doc.id) : mongo.newId()
        delete doc.manager
        delete doc.assistant
        delete doc.members
        delete doc.id
        // borra secuancias agregadas en el list para mostrar el lastValue en el nombre/////
        delete doc.seqs
        /// //////////////////////////////////////
        delete doc.open
        delete doc.webix_kids
        delete doc.updateParent
        doc.name = doc.name.replace('@', '')
        if (!doc.active) {
          doc.name = '<span class="inactive">' + doc.name + '</span>'
        } else {
          doc.name = doc.name.replace(/(<([^>]+)>)/g, '')
        }
        if (doc.offline) {
          doc.name = doc.name + '@'
        } else {
          doc.name = doc.name.replace('@', '')
        }
        delete doc.assistants
        delete doc.managerName
        delete doc.user
        mongo.save('unit', doc, (err, result) => {
          if (err) {
            send({ error: err.toString() })
          } else {
            mongo.updateAll('user', { _id: { $in: ids } }, { $addToSet: { units: doc._id } }, (err, result) => {
              if (err) {
                req.logger.log(err)
              }
              mongo.updateAll('user', { $and: [{ units: { $elemMatch: { $eq: doc._id } } }, { _id: { $nin: ids } }] }, { $pull: { units: doc._id } }, (err, result) => {
                if (err) {
                  req.logger.log(err)
                }
                send({ id: doc._id, parent: doc.parent })
              })
            })
            mongo.find('unit', {}, {}, {}, async (err, allUnits) => {
              if (err) throw err
              var item = await this.getItem(req, doc, allUnits, mongo)
              notification.send(req, req.session.context.room, 'dt_unit', item, null, null)
            })
          }
        })
      })
    })
  }

  this.list = function (req, mongo, send) {
    var pipeline = []
    if (req.query.filter && !req.query.parent) {
      const query = {}
      let filter = false
      for (const name in req.query.filter) {
        if (req.query.filter[name].length > 0) {
          filter = true
          if (name === 'name') {
            query[name] = {
              $regex: req.query.filter.name, $options: 'i'
            }
          } else {
            query[name] = req.query.filter[name].indexOf(',') !== -1 ? { $in: req.query.filter[name].split(',') } : new RegExp(req.query.filter[name].replace(/ /g, '.*'), 'i')
          }
        }
      }
      if (filter) {
        pipeline.push({ $match: query })
      }
    }
    pipeline.push({
      $addFields: {
        manager: { $filter: { input: '$actors', as: 'actor', cond: { $in: ['manager', '$$actor.type'] } } },
        assistants: { $filter: { input: '$actors', as: 'actor', cond: { $in: ['assistant', '$$actor.type'] } } },
        members: { $filter: { input: '$actors', as: 'actor', cond: { $in: ['member', '$$actor.type'] } } }
      }
    })
    pipeline.push({ $lookup: { from: 'user', localField: 'manager.user', foreignField: '_id', as: 'user' } })
    pipeline.push({ $lookup: { from: 'sequence', localField: 'sequences._id', foreignField: '_id', as: 'tsequences' } })
    pipeline.push({ $lookup: { from: 'unit', localField: 'parent', foreignField: '_id', as: 'parent' } })
    pipeline.push({ $unwind: { path: '$parent', preserveNullAndEmptyArrays: true } })
    pipeline.push({
      $addFields: {
        id: '$_id', active: { $ifNull: ['$active', true] }, actors: 1, seqs: '$sequences', sequences: '$tsequences._id',
        manager: { $arrayElemAt: ['$manager.user', 0] }, managerName: { $arrayElemAt: ['$user.name', 0] },
        assistants: '$assistants.user', members: '$members.user',
        parent: { $ifNull: ['$parent._id', '0'] }
      }
    })
    mongo.aggregate('unit', pipeline, {}, (err, units) => {
      if (err) throw err
      send(new Tree().toTree(units, 0))
    })
  }

  this.list2 = function (req, mongo, send) {
    var pipeline = []
    if (req.query.filter && !req.query.parent) {
      const query = {}
      let filter = false
      for (const name in req.query.filter) {
        if (req.query.filter[name].length > 0) {
          filter = true
          if (name === 'name') {
            query[name] = {
              $regex: req.query.filter.name, $options: 'i'
            }
          } else {
            query[name] = req.query.filter[name].indexOf(',') !== -1 ? { $in: req.query.filter[name].split(',') } : new RegExp(req.query.filter[name].replace(/ /g, '.*'), 'i')
          }
        }
      }
      if (filter) {
        pipeline.push({ $match: query })
      }
    }
    pipeline.push({
      $addFields: {
        manager: { $filter: { input: '$actors', as: 'actor', cond: { $in: ['manager', '$$actor.type'] } } },
        assistants: { $filter: { input: '$actors', as: 'actor', cond: { $in: ['assistant', '$$actor.type'] } } },
        members: { $filter: { input: '$actors', as: 'actor', cond: { $in: ['member', '$$actor.type'] } } }
      }
    })
    pipeline.push({ $lookup: { from: 'user', localField: 'manager.user', foreignField: '_id', as: 'user' } })
    pipeline.push({ $lookup: { from: 'sequence', localField: 'sequences._id', foreignField: '_id', as: 'tsequences' } })
    pipeline.push({ $lookup: { from: 'unit', localField: 'parent', foreignField: '_id', as: 'parent' } })
    pipeline.push({ $unwind: { path: '$parent', preserveNullAndEmptyArrays: true } })
    pipeline.push({
      $addFields: {
        id: '$_id', active: { $ifNull: ['$active', true] }, actors: 1, seqs: '$sequences', sequences: '$tsequences._id',
        manager: { $arrayElemAt: ['$manager.user', 0] }, managerName: { $arrayElemAt: ['$user.name', 0] },
        assistants: '$assistants.user', members: '$members.user',
        parent: { $ifNull: ['$parent._id', '0'] }
      }
    })
    mongo.aggregate('unit', pipeline, {}, (err, units) => {
      if (err) throw err
      function hash(data) {
        var obj = {}
        for (var i = 0; i < data.length; i++) {
          var pid = data[i].parent || 0
          if (!obj[pid]) obj[pid] = []
          obj[pid].push(data[i])
        }
        return obj
      }
      function toTree(data) {
        return tree(hash(data), 0)
      }
      function tree(hash, level) {
        var top = hash[level]
        if (top) {
          for (var i = 0; i < top.length; i++) {
            var branch = top[i].id
            top[i].name = top[i].name.replace(/(<([^>]+)>)/g, '')
            if (hash[branch]) {
              /* delete top[i]._id
              delete top[i].actors
              delete top[i].active
              delete top[i].seqs
              delete top[i].sequences
              delete top[i].managerName
              delete top[i].manager
              delete top[i].members
              delete top[i].assistants
              delete top[i].parent */
              top[i].children = tree(hash, branch)
            } else {
              top[i].size = 0
              if (top[i].manager) {
                top[i].size = 100
              }
              top[i].size = top[i].size + top[i].members.length * 100 + top[i].assistants.length * 100
              /* delete top[i]._id
              delete top[i].actors
              delete top[i].active
              delete top[i].seqs
              delete top[i].sequences
              delete top[i].managerName
              delete top[i].manager
              delete top[i].members
              delete top[i].assistants
              delete top[i].parent */
            }
          }
        }
        return top
      }
      send({ description: { name: 'flare', children: toTree(units) } })
    })
  }

  this.getItem = async function (req, unit, allUnits, mongo) {
    unit.createPlans = Number(unit.createPlans)
    unit.createProjects = Number(unit.createProjects)
    unit.createStrategies = Number(unit.createStrategies)
    unit.id = unit._id.toString()
    unit.active = unit.active === undefined ? true : unit.active
    /// para agregar el lastValue /////////
    unit.seqs = unit.sequences
    /// ///////////
    if (unit.sequences) {
      var seqs = []
      for (const i in unit.sequences) {
        if (unit.sequences[i] && unit.sequences[i]._id) { seqs.push(unit.sequences[i]._id) }
      }
      unit.sequences = seqs
    }
    if (unit.actors) {
      var manager = []

      var members = []

      var assistants = []
      for (const i in unit.actors) {
        if (unit.actors[i].type[0] === 'manager') {
          manager.push(unit.actors[i].user)
          await new Promise(resolve => {
            mongo.findId('user', unit.actors[i].user, { name: 1 }, (err, user) => {
              if (err || !user) {
                resolve()
              } else {
                unit.managerName = user.name
                resolve()
              }
            })
          })
        }
        if (unit.actors[i].type[0] === 'member') {
          members.push(unit.actors[i].user)
        }
        if (unit.actors[i].type[0] === 'assistant') {
          assistants.push(unit.actors[i].user)
        }
      }
      unit.manager = manager
      unit.members = members
      unit.assistants = assistants
    }
    function find(x) {
      var p = x.parent ? x.parent.toString() : ''
      return p === unit.id
    }
    const parent = allUnits.findIndex(find)
    if ((unit.parent === '' && parent !== -1) || (req.query.parent && parent !== -1) || parent !== -1) {
      unit.webix_kids = true
    }

    return unit
  }

  this.delete = async function (req, mongo, send) {
    var doc = req.query
    var idUnit = mongo.toId(doc._id)
    var pipeline = [
      { $match: { _id: idUnit } },
      {
        $lookup: {
          from: 'project',
          let: { idUnit: '$_id' },
          pipeline: [{
            $match: {
              $expr: {
                $or: [
                  { $eq: ['$unit', '$$idUnit'] },
                  { $in: ['$$idUnit', { $cond: { if: { $isArray: ['$units'] }, then: '$units', else: ['$units'] } }] }
                ]
              }
            }
          }, {
            $project: { _id: 1, unit: 1, units: 1 }
          }], as: 'projects'
        }
      }, {
        $lookup: {
          from: 'attached',
          let: { idUnit: '$_id' },
          pipeline: [{
            $match: {
              $expr: { $in: ['$$idUnit', { $cond: { if: { $isArray: ['$units'] }, then: '$units', else: ['$units'] } }] },
              units: { $exists: true }
            }
          }, {
            $project: { _id: 1, units: 1 }
          }], as: 'attacheds'
        }
      },
      {
        $lookup: {
          from: 'auditable',
          let: { idUnit: '$_id' },
          pipeline: [{
            $match: {
              $expr: {
                $or: [
                  { $eq: ['$unit', '$$idUnit'] },
                  { $in: ['$$idUnit', { $cond: { if: { $isArray: ['$units'] }, then: '$units', else: ['$units'] } }] }
                ]
              }
            }
          }, {
            $project: { _id: 1, unit: 1, units: 1 }
          }], as: 'auditables'
        }
      },
      {
        $lookup: {
          from: 'document',
          let: { idUnit: '$_id' },
          pipeline: [{
            $match: {
              $expr: { $in: ['$$idUnit', { $cond: { if: { $isArray: ['$units'] }, then: '$units', else: ['$units'] } }] },
              units: { $exists: true }
            }
          }, {
            $project: { _id: 1, units: 1 }
          }], as: 'documents'
        }
      },
      {
        $lookup: {
          from: 'evidence',
          let: { idUnit: '$_id' },
          pipeline: [{
            $match: {
              $expr: { $in: ['$$idUnit', { $cond: { if: { $isArray: ['$units'] }, then: '$units', else: ['$units'] } }] },
              units: { $exists: true }
            }
          }, {
            $project: { _id: 1, units: 1 }
          }], as: 'evidences'
        }
      },
      {
        $lookup: {
          from: 'plan',
          let: { idUnit: '$_id' },
          pipeline: [{
            $match: { $expr: { $eq: ['$unit', '$$idUnit'] } }
          }, {
            $project: { _id: 1, unit: 1 }
          }], as: 'plans'
        }
      },
      {
        $lookup: {
          from: 'process',
          let: { idUnit: '$_id' },
          pipeline: [{
            $match: {
              $expr: { $in: ['$$idUnit', { $cond: { if: { $isArray: ['$units'] }, then: '$units', else: ['$units'] } }] },
              units: { $exists: true }
            }
          }, {
            $project: { _id: 1, units: 1 }
          }], as: 'processes'
        }
      },
      {
        $lookup: {
          from: 'report',
          let: { idUnit: '$_id' },
          pipeline: [{
            $match: {
              $expr: { $in: ['$$idUnit', { $cond: { if: { $isArray: ['$units'] }, then: '$units', else: ['$units'] } }] },
              units: { $exists: true }
            }
          }, {
            $project: { _id: 1, units: 1 }
          }], as: 'reports'
        }
      },
      {
        $lookup: {
          from: 'riskEvent',
          let: { idUnit: '$_id' },
          pipeline: [{
            $match: { $expr: { $eq: ['$unit', '$$idUnit'] } }
          }, {
            $project: { _id: 1, unit: 1 }
          }], as: 'riskEvents'
        }
      },
      {
        $lookup: {
          from: 'settings',
          let: { idUnit: '$_id' },
          pipeline: [{
            $match: {
              $expr: {
                $or: [
                  { $eq: ['$auditCommittee', '$$idUnit'] },
                  { $eq: ['$auditUnit', '$$idUnit'] }
                ]
              }
            }
          }, {
            $project: { _id: 1, auditCommittee: 1, auditUnit: 1 }
          }], as: 'settings'
        }
      },
      {
        $lookup: {
          from: 'template',
          let: { idUnit: '$_id' },
          pipeline: [{
            $match: {
              $expr: { $in: ['$$idUnit', { $cond: { if: { $isArray: ['$units'] }, then: '$units', else: ['$units'] } }] },
              units: { $exists: true }
            }
          }, {
            $project: { _id: 1, units: 1 }
          }], as: 'templates'
        }
      },
      {
        $lookup: {
          from: 'user',
          let: { idUnit: '$_id' },
          pipeline: [{
            $match: {
              $expr: { $in: ['$$idUnit', { $cond: { if: { $isArray: ['$units'] }, then: '$units', else: ['$units'] } }] },
              units: { $exists: true }
            }
          }, {
            $project: { _id: 1, units: 1 }
          }], as: 'users'
        }
      },
      {
        $lookup: {
          from: 'note',
          let: { idUnit: '$_id' },
          pipeline: [
            {
              $addFields: {
                actor: {
                  $ifNull: [{
                    $filter: {
                      input: '$actors',
                      as: 'actor',
                      cond: { $eq: ['$$actor.unit', '$$idUnit'] }
                    }
                  }, []]
                }
              }
            },
            {
              $match: {
                $expr: {
                  $gte: [{ $size: '$actor' }, 1]

                },
              }
            },
            {
              $project: { _id: 1 }
            }
          ],
          as: 'notes'
        }
      },
      { $project: { _id: 1, name: 1, projects: 1, attacheds: 1, auditables: 1, documents: 1, evidences: 1, plans: 1, processes: 1, reports: 1, riskEvents: 1, settings: 1, templates: 1, users: 1, notes: 1 } },
      { $sort: { _id: -1 } }
    ]

    var unit = await new Promise(resolve => {
      mongo.aggregate('unit', pipeline, {}, async (err, unit) => {
        if (err) {
          resolve()
        } else {
          resolve(unit)
        }
      })
    })
    if (unit && unit[0] && (
      (unit[0].projects && unit[0].projects.length) ||
      (unit[0].attacheds && unit[0].attacheds.length) ||
      (unit[0].auditables && unit[0].auditables.length) ||
      (unit[0].documents && unit[0].documents.length) ||
      (unit[0].evidences && unit[0].evidences.length) ||
      (unit[0].plans && unit[0].plans.length) ||
      (unit[0].processes && unit[0].processes.length) ||
      (unit[0].reports && unit[0].reports.length) ||
      (unit[0].riskEvents && unit[0].riskEvents.length) ||
      (unit[0].settings && unit[0].settings.length) ||
      (unit[0].notes && unit[0].notes.length) ||
      (unit[0].templates && unit[0].templates.lengt))) {
      send({ msj: '_cantDeleteUnitAlreadyInUse' }) //La unidad no se puede borrar porque ya ha sido utilizada en el sistema
    } else {
      mongo.findId('unit', mongo.toId(doc._id), (err, unit) => {
        if (err) {
          send({ error: err })
        } else {
          mongo.deleteOne('unit', { _id: mongo.toId(doc._id) }, async (err, result) => {
            if (err) {
              req.logger.log(err)
            } else {
              var users = await new Promise(resolve => {
                mongo.find('user', { units: mongo.toId(doc._id) }, { units: 1 }, async (err, users) => {
                  if (err) {
                    resolve(false)
                  } else {
                    resolve(users)
                  }
                })
              })
              if (users && users.length) {
                for (let u in users) {
                  if (users[u].units && users[u].units.length) {
                    let ex = users[u].units.findIndex((x) => {
                      return x.toString() === doc._id.toString()
                    })
                    if (ex !== -1) {
                      users[u].units.splice(ex, 1)
                      var users = await new Promise(resolve => {
                        mongo.save('user', users[u], (err, result) => {
                          if (err) {
                            resolve(false)
                          } else {
                            resolve(result)
                          }
                        })
                      })
                    }
                  }
                }
              }
              req.app.routes.trash.insert(req, mongo, 'unit', unit, () => {
                send({ id: doc._id })
                doc.id = doc._id
                notification.send(req, req.session.context.room, 'dt_unit', doc, null, true)
              })
            }
          })
        }
      })
    }
  }
}


/* exported */
var tags = require('../utils/tags').tags
var Html = require('../utils/html').Html
var dateformat = require('dateformat')
var html = new Html()
var moment = require('moment')
var Notification = require('../utils/notification').Notification
var notification = new Notification()
var Sequence = require('./sequence').Sequence
var sequence = new Sequence()
var rest = require('axios')
var https = require('https')

exports.Project = Project

function Project() {
  this.adjust = function (req, mongo, send) {
    var before = Number(req.query.before)
    var now = Number(req.query.now)
    var project = mongo.toId(req.query.project)
    mongo.updateAll('task', { project: project, type: 'task' }, [{ $set: { duration: { $round: [{ $divide: [{ $multiply: ['$duration', now] }, before] }] } } }], (err, result) => {
      if (err) {
        req.statusCode = 404
        send({ error: err })
      } else {
        send({ saved: result })
      }
    })
  }

  this.downloadFiles = async function (req, mongo, send) {
    var data = req.body
    data.urlDb = req.session.database
    data.fileLink = req.headers.referer + 'api/user.goURL?users=' + [req.session.context.user] + '&link=' + req.headers.referer + 'api/file.get?_id=#idFile#'
    var config = {
      method: 'GET',
      url: process.env.NODE_ENV !== 'production' ? 'https://gpax8.gpax.design/api.x/gpax.descargarArchivosProyecto' : 'https://bpe.gpax.io/api.x/gpax.descargarArchivosProyecto',
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      }),
      headers: {},
      timeout: 12000,
      params: data
    }
    var data = {}
    rest(config)
      .then(result => {
        data = result.data
        send(data)
      })
      .catch(err => {
        data.message = err.message
        send(data)
      })
  }

  this.checkTimereportTask = function (req, mongo, send) {
    var task = mongo.toId(req.body.task)
    if (req.body.status === 'done') {
      mongo.find('time', { document: task, user: mongo.toId(req.body.user) }, (err, time) => {
        if (err) {
          req.statusCode = 404
          send({ error: err })
        } else {
          if (time.length) {
            send({ result: true })
          } else {
            send({ result: false })
          }
        }
      })
    } else {
      send({ result: true })
    }
  }

  this.gantt = function (req, mongo, send) {
    var project = mongo.toId(req.query._id)
    var pipeline = [
      { $match: { _id: project } },
      {
        $lookup: {
          from: 'task', let: { project: '$_id' }, as: 'tasks',
          pipeline: [
            { $match: { $expr: { $eq: ['$project', '$$project'] } } },
            {
              $lookup: {
                from: 'time', let: { task: '$_id' }, as: 'progress',
                pipeline: [{ $match: { $expr: { $eq: ['$document', '$$task'] } } }, { $group: { _id: null, real: { $sum: '$duration' } } }]
              }
            },
            { $unwind: { path: '$progress', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'task', localField: '_id', foreignField: 'parent', as: 'childs' } },
            { $lookup: { from: 'task', localField: 'parent', foreignField: '_id', as: 'parentTask' } },
            {
              $project: {
                color: 1, constraint_type: 1, list: 1, checkList: 1, lineThrough: 1, compliance: 1, configColumnsDocuments: 1, templates: 1, duration: 1, realProgress: 1, description: 1, documents: 1, id: 1, links: 1, orden: 1, progressColor: 1, project: 1, realDuration: { $ifNull: ['$progress.real', 0] },
                render: 1, status: 1, statusDisplay: 1, text: 1, _id: 1, owner_id: 1, calendar: 1, calendar_id: 1, workDay: 1,
                parent: { $cond: { if: { $eq: [{ $size: '$parentTask' }, 0] }, then: 0, else: '$parent' } },
                type: { $cond: { if: { $eq: [{ $size: '$childs' }, 0] }, then: { $cond: { if: { $eq: ['$type', 'milestone'] }, then: '$type', else: 'task' } }, else: 'project' } },
                progress: { $cond: { if: { $eq: ['$duration', 0] }, then: 0, else: { $divide: [{ $ifNull: ['$progress.real', 0] }, '$duration'] } } },
                end_date: {
                  $cond: {
                    if: { $and: [{ $ne: [{ $type: '$end_date' }, 'string'] }, { $ne: ['$end_date', ''] }] },
                    then: { $cond: { if: { $eq: ['$end_date', ''] }, then: '', else: { $dateToString: { format: '%Y-%m-%d %H:%M', date: '$end_date', timezone: '-06:00' } } } },
                    else: { $ifNull: ['$end_date', ''] }
                  }
                },
                end_dateMax: {
                  $cond: {
                    if: { $and: [{ $ne: [{ $type: '$start_date' }, 'string'] }, { $ne: ['$start_date', ''] }] },
                    then: { $cond: { if: { $eq: ['$start_date', ''] }, then: '', else: { $dateToString: { format: '%Y-%m-%d %H:%M', date: { $cond: { if: { $eq: ['$end_date', ''] }, then: '$start_date', else: '$end_date' } }, timezone: '-06:00' } } } },
                    else: { $ifNull: ['$start_date', ''] }
                  }
                },
                start_date: {
                  $cond: {
                    if: { $and: [{ $ne: [{ $type: '$start_date' }, 'string'] }, { $ne: ['$start_date', ''] }] },
                    then: { $cond: { if: { $eq: ['$start_date', ''] }, then: '', else: { $dateToString: { format: '%Y-%m-%d %H:%M', date: '$start_date', timezone: '-06:00' } } } },
                    else: '$start_date'
                  }
                }
              }
            },
            { $sort: { orden: 1, start_date: 1 } }
          ]
        }
      },
      { $lookup: { from: 'plan', localField: 'plan', foreignField: '_id', as: 'plan' } },
      { $unwind: '$plan' },
      {
        $addFields: {
          start: { $dateFromString: { dateString: '$plan.period.start', timezone: '-06:00' } },
          end: { $dateFromString: { dateString: '$plan.period.end', timezone: '-06:00' } },
          taskStart: {
            $dateFromString: {
              dateString: { $min: { $filter: { input: '$tasks.start_date', as: 'it', cond: { $ne: ['$$it', ''] } } } },
              timezone: '-06:00'
            }
          },
          taskEnd: {
            $dateFromString: {
              dateString: { $max: { $filter: { input: '$tasks.end_dateMax', as: 'it', cond: { $ne: ['$$it', ''] } } } },
              timezone: '-06:00'
            }
          }
        }
      },
      {
        $lookup: {
          from: 'user', as: 'resources',
          let: {
            users: { $cond: { if: { $isArray: '$actors.user' }, then: '$actors.user', else: [] } },
            plan: '$plan._id', project: '$_id', start: '$start', end: '$end',
            projects: { $concatArrays: '$plan.goals.projects' }
          },
          pipeline: [
            { $match: { $expr: { $in: ['$_id', '$$users'] } } },
            {
              $lookup: {
                from: 'task', let: { user: '$_id', plan: '$$plan', project: '$$project' }, as: 'tasks',
                pipeline: [
                  { $match: { owner_id: '$$user', status: { $ne: 'suspended' }, type: 'task', project: '$$projects' } },
                  { $group: { _id: null, minutes: { $sum: '$duration' } } },
                ]
              }
            },
            {
              $lookup: {
                from: 'activityUser', let: { user: '$_id', plan: '$$plan' }, as: 'activities',
                pipeline: [
                  { $match: { $expr: { $and: [{ $eq: ['$_id.user', '$$user'] }, { $eq: ['$_id.plan', '$$plan'] }] } } },
                  { $group: { _id: null, minutes: { $sum: '$planned' } } }
                ]
              }
            },
            {
              $addFields: {
                start: { $ifNull: ['$business.beginHiring', '$$start'] },
                end: { $ifNull: ['$business.endHiring', '$$end'] },
              }
            },
            {
              $project: {
                id: '$_id', text: '$name', workDay: '$business.workDay', _id: 0,
                start: { $cond: { if: { $gt: ['$start', '$$start'] }, then: '$start', else: '$$start' } },
                end: { $cond: { if: { $lt: ['$end', '$$end'] }, then: '$end', else: '$$end' } },
                minutes: { $ifNull: [{ $add: [{ $ifNull: [{ $arrayElemAt: ['$tasks.minutes', 0] }, 0] }, { $ifNull: [{ $arrayElemAt: ['$activities.minutes', 0] }, 0] }] }, 0] }
              }
            }
          ]
        }
      },
      {
        $project: {
          _id: 0, id: '$_id',
          content: {
            gantt: {
              data: '$tasks',
              links: {
                $reduce: {
                  input: {
                    $filter: {
                      input: '$tasks.links',
                      as: 'link',
                      cond: { $ne: ['$$link', []] }
                    }
                  },
                  initialValue: [],
                  in: { $concatArrays: ['$$value', '$$this'] }
                }
              }
            },
            plan: '$plan._id',
            holidays: '$plan.holidays',
            manager: { $arrayElemAt: ['$actors.user', { $indexOfArray: ['$actors.role', 'manager'] }] },
            period: {
              start: {
                $dateToString: {
                  format: '%Y/%m/%d', date: { $cond: { if: { $gt: ['$start', '$taskStart'] }, then: '$taskStart', else: '$start' } }, timezone: '-06:00'
                }
              },
              end: { $dateToString: { format: '%Y/%m/%d', date: { $cond: { if: { $lt: ['$end', '$taskEnd'] }, then: '$taskEnd', else: '$end' } }, timezone: '-06:00' } }
            },
            resources: '$resources',
            workDay: '$workDay'
          },
          name: 1
        }
      }
    ]
    mongo.aggregate('project', pipeline, {}, async (err, project) => {
      if (err || !project) {
        req.statusCode = 500
        send(err.toString())
      } else {
        var reply = project[0]
        let plan = await new Promise(resolve => {
          mongo.findId('plan', mongo.toId(reply.content.plan), (err, plan) => {
            if (!err && plan) {
              resolve(plan)
            } else {
              resolve(false)
            }
          })
        })
        let calendar = ''
        var dateArray = []
        if (plan && plan.calendar) {
          calendar = await new Promise(resolve => {
            mongo.findId('calendar', plan.calendar, (err, calendar) => {
              if (!err && calendar) {
                resolve(calendar)
              } else {
                resolve(false)
              }
            })
          })
          if (calendar && calendar.days && calendar.days.length) {
            for (let i in calendar.days) {
              let day = calendar.days[i]
              var currentDate = day.fromAdd
              while (currentDate <= day.toAdd) {
                dateArray.push(new Date(currentDate))
                var date = new Date(currentDate)
                currentDate = new Date(date.setDate(date.getDate() + 1))
              }
            }
          }
        }
        if (dateArray.length) reply.content.holidays = dateArray
        for (let i in reply.content.resources) {
          let resource = reply.content.resources[i]
          resource.businessMinutes = this.businessDays(resource.start, resource.end, reply.holidays) * resource.workDay
          resource.workDayUser = resource.workDay
        }
        send(reply)
      }
    })
  }

  this.actionGantt = function (req, mongo, send) {
    var item = req.body.item
    notification.send(req, req.session.context.room, 'ganttProj' + req.query.id, { item: JSON.stringify(item), action: req.query.action, subject: req.query.subject }, null, null)
    send()
  }

  this.duplicateTask = async function (req, mongo, send) {
    var item = req.body.item
    for (var i in item) {
      item[i]._id = item[i].id
      item[i].status = 'processing'
      item[i].color = '#808ff7'
      item[i].start_date = new Date(item[i].start_date)
      item[i].end_date = new Date(item[i].end_date)
      item[i].project = req.body.id.toString().split('.')[1]
      await new Promise(resolve => { mongo.save('task', item[i], () => { resolve() }) })
      await new Promise(resolve => {
        notification.send(req, req.session.context.room, 'ganttProj' + req.body.id.toString(), { id: item[i].id, item: JSON.stringify(item[i]), action: 'add', subject: 'task' }, null, null)
        resolve()
      })
    }
    send()
  }

  this.toModel = async function (req, mongo, send) {
    let id = req.body._id
    mongo.findId('project', id, async (err, proj) => {
      if (err && !proj) {
        if (err) console.log(err)
        send()
      } else {
        let model = {}
        var tasks = await new Promise((resolve) => {
          mongo.find('task', { project: proj._id }, (err, tasks) => {
            if (err) { resolve(false) } else { resolve(tasks) }
          })
        })
        if (tasks && tasks.length) {
          var links = []
          model._id = mongo.newId()
          model.duration = proj.duration
          model.name = 'Modelo creado del proyecto ' + proj.name
          model.public = 1
          model.units = proj.units
          model.workDay = proj.workDay || 480
          model.tags = []
          model.type = 'project'
          model.template = {
            data: [],
            links: [],
            autoSchedule: proj.content.autoSchedule
          }
          for (let i in tasks) {
            let task = tasks[i]
            if (task.links && task.links.length) {
              for (let y in task.links) {
                links.push(task.links[y])
              }
            }
          }
          let objParent = {}
          await procesar(tasks, 0)
          async function procesar(tasks, i) {
            if (tasks.length > i) {
              let task = tasks[i]
              if (task._id) {
                let templates = []
                if (req.body.copyDoc) {
                  if (task.documents && task.documents.length) {
                    for (let d in task.documents) {
                      let document = task.documents[d]
                      let temp = await new Promise(resolve => {
                        mongo.findId('document', document, { template: 1 }, (err, doc) => {
                          if (err || !doc) {
                            if (err) {
                              console.log(err)
                              resolve(false)
                            } else {
                              mongo.findId('note', document, { template: 1 }, (err, not) => {
                                if (err || !not) {
                                  if (err) console.log(err)
                                  resolve(false)
                                } else {
                                  resolve(not.template)
                                }
                              })
                            }
                          } else {
                            resolve(doc.template)
                          }
                        })
                      })
                      if (temp) {
                        templates.push(temp)
                      }
                    }
                  }
                }
                let newId = mongo.newId()
                let newTask = {
                  id: newId,
                  start_date: task.start_date,
                  text: task.text,
                  duration: task.duration,
                  constraint_type: task.constraint_type,
                  progress: 0,
                  parent: task.parent,
                  documents: [],
                  templates: templates,
                  type: task.type,
                  description: task.description,
                  compliance: task.compliance,
                  list: task.list,
                  end_date: task.end_date
                }
                model.template.data.push(newTask)
                objParent[task._id.toString()] = newId.toString()
                for (let l in links) {
                  let link = links[l]
                  if (task._id && link.source.toString() === task._id.toString()) {
                    link.source = newId
                  }
                  if (task._id && link.target.toString() === task._id.toString()) {
                    link.target = newId
                  }
                }
              }
              await procesar(tasks, i + 1)
            }
          }
          for (let o in model.template.data) {
            let task = model.template.data[o]
            if (task.parent) {
              task.parent = objParent[task.parent.toString()]
            }
          }
          model.template.links = links
          mongo.save('template', model, (err) => {
            if (err) {
              console.log(err)
              send(err)
            } else {
              send()
            }
          })
        } else {
          send()
        }
      }
    })
  }
  this.businessDays = function (start, end, holidays) {
    var days = Math.trunc((end - start) / 86400000)
    var res = (days % 7) - 1
    // Subtract weekend of complete weeks between start-end
    days -= (Math.trunc(days / 7) * 2)
    // Subtract weekend of last incomplete week
    if (res) {
      var d = end
      d.setDate(d.getDate() - res)
      let dw = d.getDay()
      for (let i = 0; i < res; ++i) {
        if (dw === 0 || dw === 6 || dw === 7) {
          --days
        }
        dw = (++dw) % 7
      }
    }
    // Subtract holidays between start-end if is not weekend
    for (let i in holidays) {
      let date = holidays[i]
      if (date <= end && date >= start && [0, 6].indexOf(date.getDay()) === -1) {
        --days
      }
    }
    return days
  }

  this.details = function (req, mongo, send) {
    var project = mongo.toId(req.query._id)
    var pipeline = [
      { $match: { _id: project } },
      {
        $lookup: {
          from: 'task', let: { project: '$_id' }, as: 'task',
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$project', '$$project'] }, { $ne: ['$status', 'suspended'] }, { $or: [{ $eq: ['$type', 'task'] }, { $eq: ['$type', ''] }] }] } } },
            { $lookup: { from: 'task', localField: '_id', foreignField: 'parent', as: 'childs' } },
            { $match: { $expr: { $eq: [{ $size: '$childs' }, 0] } } },
            { $lookup: { from: 'time', localField: '_id', foreignField: 'document', as: 'time' } },
            {
              $addFields: {
                totalReal: { $reduce: { input: '$time', initialValue: 0, in: { $add: ['$$value', { $toDouble: '$$this.duration' }] } } },
              }
            },
            {
              $group: {
                _id: '$status',
                duration: { $sum: { $toDouble: '$duration' } },
                real: { $sum: { $toDouble: '$totalReal' } }
              }
            }
          ]
        }
      },
      {
        $lookup: {
          from: 'task',
          let: { project: '$_id', planPeriod: '$planPeriod' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$project', '$$project'] }, { $ne: ['$status', 'suspended'] }, { $or: [{ $eq: ['$type', 'task'] }, { $eq: ['$type', ''] }] }] } } },
            { $lookup: { from: 'task', localField: '_id', foreignField: 'parent', as: 'childs' } },
            { $match: { $expr: { $eq: [{ $size: '$childs' }, 0] } } },
            { $group: { _id: null, inicio: { $min: '$start_date' }, fin: { $max: '$end_date' } } },
            {
              $addFields: {
                inicio: {
                  $cond: {
                    if: { $and: [{ $eq: [{ $type: '$inicio' }, 'string'] }, { $ne: ['$inicio', ''] }] },
                    then: { $dateFromString: { dateString: '$inicio', timezone: '-06:00' } },
                    else: '$inicio'
                  }
                },
                fin: {
                  $cond: {
                    if: { $and: [{ $eq: [{ $type: '$fin' }, 'string'] }, { $ne: ['$fin', ''] }] },
                    then: { $dateFromString: { dateString: '$fin', timezone: '-06:00' } },
                    else: '$fin'
                  }
                }
              }
            },
            {
              $project: {
                period: {
                  $concat: [
                    ': ',
                    {
                      $cond: {
                        if: { $ne: ['$inicio', ''] },
                        then: { $dateToString: { format: '%Y/%m/%d', date: '$inicio', timezone: '-06:00', onNull: 'unspecified' } },
                        else: {
                          $dateToString: {
                            format: '%Y/%m/%d',
                            date: {
                              $arrayElemAt: [
                                {
                                  $cond: {
                                    if: { $isArray: ['$$planPeriod'] },
                                    then: '$$planPeriod',
                                    else: []
                                  }
                                },
                                0
                              ]
                            },
                            timezone: '-06:00',
                            onNull: 'unspecified'
                          }
                        }
                      }
                    },
                    ' - ',
                    {
                      $cond: {
                        if: { $ne: ['$fin', ''] },
                        then: { $dateToString: { format: '%Y/%m/%d', date: '$fin', timezone: '-06:00', onNull: 'unspecified' } },
                        else: {
                          $dateToString: {
                            format: '%Y/%m/%d',
                            date: {
                              $arrayElemAt: [
                                {
                                  $cond: {
                                    if: { $isArray: ['$$planPeriod'] },
                                    then: '$$planPeriod',
                                    else: []
                                  }
                                },
                                1
                              ]
                            },
                            timezone: '-06:00',
                            onNull: 'unspecified'
                          }
                        }
                      }
                    },
                  ]
                },
              }
            }
          ],
          as: 'taskStartEnd'
        }
      },
      {
        $addFields: {
          totalTime: { $reduce: { input: '$task', initialValue: 0, in: { $add: ['$$value', { $toDouble: '$$this.duration' }] } } },
          totalReal2: { $reduce: { input: '$task', initialValue: 0, in: { $add: ['$$value', { $toDouble: '$$this.real' }] } } }
        }
      },
      { $lookup: { from: 'unit', localField: 'unit', foreignField: '_id', as: 'deparment' } },
      { $lookup: { from: 'plan', localField: 'plan', foreignField: '_id', as: 'plans' } },
      {
        $addFields: {
          members: { $filter: { input: '$actors', as: 'actor', cond: { $not: [{ $in: ['manager', '$$actor.type'] }] } } },
          manager: { $filter: { input: '$actors', as: 'actor', cond: { $in: ['manager', '$$actor.type'] } } },
          duration: { $round: [{ $ifNull: [{ $divide: ['$totalTime', { $cond: ['$workDay', { $cond: [{ $eq: ['$workDay', NaN] }, 480, '$workDay'] }, 480] }] }, 0] }, 2] },
          realDuration: { $round: [{ $divide: ['$totalReal2', { $cond: ['$workDay', { $cond: [{ $eq: ['$workDay', NaN] }, 480, '$workDay'] }, 480] }] }, 2] }
        }
      },
      {
        $project: {
          area: 1, auditable: 1, description: 1, duration: 1, name: 1, plan: 1, realDuration: 1, realPeriod: 1, risk: 1, status: 1,
          tag: 1, type: 1, unit: 1, units: 1, planPeriod: 1, processes: 1, members: '$members.user', project: '$_id',
          manager: { $arrayElemAt: ['$manager.user', 0] },
          nameDepartment: { $arrayElemAt: ['$deparment.name', 0] },
          planName: { $arrayElemAt: ['$plans.name', 0] },
          progress: { $multiply: [{ $divide: ['$realDuration', { $cond: { if: { $in: ['$duration', [null, 0]] }, then: 1, else: '$duration' } }] }, 100] },
          info: '$taskStartEnd.period'
        }
      },
      { $sort: { project: -1 } }
    ]
    mongo.aggregate('project', pipeline, {}, (err, project) => {
      send(project ? project[0] : null)
    })
  }
  this.taskIds = function (content, mongo, replaceAll) {
    // Replace each task id with new mongo id
    var ids = {}
    var id
    for (const i in content.data) {
      var task = content.data[i]
      if (replaceAll) task.status = 'draft'
      if (replaceAll || !mongo.isNativeId(task.id)) {
        id = mongo.newId()
        ids['' + task.id] = id
        if (content.calendars) {
          content.calendars.findIndex((c) => {
            if (c.id.includes(task.id)) {
              c.id = 'calendar' + id.toString()
            }
          })
        }
        task.id = id
      }
    }
    // Replace parent ids with respective mongo id
    for (const i in content.data) {
      task = content.data[i]
      if (task.parent && ids['' + task.parent]) {
        task.parent = ids[task.parent]
      }
    }
    // Replace source & target ids in each link with respective mongo id
    for (const i in content.links) {
      const link = content.links[i]
      id = ids['' + link.source]
      if (id) {
        link.source = id
      }
      id = ids['' + link.target]
      if (id) {
        link.target = ids[link.target]
      }
      if (replaceAll) {
        link.id = mongo.newId()
      }
    }
  }
  this.all = async function (req, mongo, send) {
    send([])
  }
  this.tags = async function (req, mongo, send) {
    var projectTags = await new Promise(resolve => {
      mongo.find('params', { name: 'projectTag' }, { _id: 1, name: 1, options: 1 }, (err, tagsDoc) => {
        if (err || (tagsDoc && tagsDoc.length === 0)) {
          console.log(err)
          resolve([])
        } else {
          resolve(tagsDoc[0].options)
        }
      })
    })
    var tags = await new Promise(resolve => {
      mongo.find('params', { name: 'tag' }, { _id: 1, name: 1, options: 1 }, (err, tagsDoc) => {
        if (err || (tagsDoc && tagsDoc.length === 0)) {
          console.log(err)
          resolve([])
        } else {
          resolve(tagsDoc[0].options)
        }
      })
    })
    var tagsDoc = projectTags.concat(tags)
    send(tagsDoc)
  }

  this.list2 = async function (req, mongo, send) {
    var skip = parseInt(req.query.start) || 0
    var limit = parseInt(req.query.count) || 50
    var reply = { data: [], pos: skip }
    /* filering documents with user of session or unit of user of session and not hidden */
    var projectTags = await new Promise(resolve => {
      mongo.find('params', { name: 'projectTag' }, { _id: 1, name: 1, options: 1 }, (err, tagsDoc) => {
        if (err || (tagsDoc && tagsDoc.length === 0)) {
          console.log(err)
          resolve([])
        } else {
          resolve(tagsDoc[0].options)
        }
      })
    })
    var tags = await new Promise(resolve => {
      mongo.find('params', { name: 'tag' }, { _id: 1, name: 1, options: 1 }, (err, tagsDoc) => {
        if (err || (tagsDoc && tagsDoc.length === 0)) {
          console.log(err)
          resolve([])
        } else {
          resolve(tagsDoc[0].options)
        }
      })
    })
    var tagsDoc = projectTags.concat(tags)
    var keys = {
      $or: [
        { 'actors.user': req.session.context.user }
      ]
    }
    if (req.session.context.managerUnits.length > 0) {
      keys.$or.push({ unit: { $in: req.session.context.managerUnits } })
    }
    if (req.session.context.assistantUnits.length > 0) {
      keys.$or.push({ unit: { $in: req.session.context.assistantUnits } })
    }
    if (req.session.context.dependentUnits.length > 0) {
      keys.$or.push({ unit: { $in: req.session.context.dependentUnits } })
    }
    if (req.query.projGoals) {
      keys.$or.push({ unit: { $exists: 0 } })
      keys.$or.push({ unit: { $eq: '' } })
    }
    /* apply filter in parameters */
    const query = {}
    var all = false
    if (req.query.filter) {
      for (const name in req.query.filter) {
        if (req.query.filter[name].length > 0 && req.query.filter[name] !== 'empty') {

          if (name === 'manager') {
            query.actors = { $elemMatch: { user: mongo.toId(req.query.filter.manager), type: 'manager' } }
          } else if (name === 'name') {
            query[name] = { $regex: req.query.filter.name, $options: 'i' }
          } else if (name === 'unitCode') {
            query.unit = mongo.toId(req.query.filter.unitCode)
          } else if (name === 'planName') {
            query.plan = mongo.toId(req.query.filter.planName)
          } else if (name === 'path') {
            query.actors = { $elemMatch: { user: req.session._id, path: req.query.filter.path.indexOf(',') ? { $in: req.query.filter.path.split(',') } : req.query.filter.path } }
          } else if (name === 'tagsname') {
            query.tags = mongo.toId(req.query.filter.tagsname)
          } else if (name === '_id') {
            var ids = req.query.filter[name].split(',')
            for (const i in ids) {
              if (mongo.isNativeId(ids[i])) {
                ids[i] = mongo.toId(ids[i])
              }
            }
            query[name] = { $in: ids }
          } else if (req.query.filter[name] === 'all') {
            all = true
          } else {
            query[name] = req.query.filter[name].indexOf(',') !== -1 ? { $in: req.query.filter[name].split(',') } : new RegExp(req.query.filter[name].replace(/ /g, '.*'), 'i')
          }
        }
      }
    }
    if (Object.keys(query).length > 0) {
      keys = { $and: [keys, query] }
    } else if (!all) {
      keys = { $and: [keys, { status: 'processing' }] }
    }
    /* read limit rows from skip position */
    var pipeline = []
    pipeline.push({ $match: keys })
    pipeline.push({ $lookup: { from: 'user', localField: 'actors.user', foreignField: '_id', as: 'allUser' } })
    pipeline.push({ $unwind: { path: '$actors', preserveNullAndEmptyArrays: true } })
    pipeline.push({ $match: { $or: [{ 'actors.type': 'manager' }, { actors: null }] } })
    pipeline.push({ $lookup: { from: 'user', localField: 'actors.user', foreignField: '_id', as: 'user' } })
    pipeline.push({ $lookup: { from: 'unit', localField: 'unit', foreignField: '_id', as: 'unit' } })
    pipeline.push({ $lookup: { from: 'plan', localField: 'plan', foreignField: '_id', as: 'plan' } })
    pipeline.push({
      $lookup: {
        from: 'task',
        let: { find: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$project', '$$find'] }, { $in: ['$status', ['done', 'reviewed', 'completed']] }] } } },
          { $lookup: { from: 'task', localField: '_id', foreignField: 'parent', as: 'childs' } },
          { $match: { $expr: { $eq: [{ $size: '$childs' }, 0] } } },
          { $group: { _id: null, durationReal: { $sum: { $toDouble: '$duration' } } } },
          { $project: { tiempo: '$durationReal' } }
        ],
        as: 'completedTime'
      }
    })
    pipeline.push({
      $lookup: {
        from: 'task',
        let: { find: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$project', '$$find'] } } },
          { $lookup: { from: 'task', localField: '_id', foreignField: 'parent', as: 'childs' } },
          { $match: { $expr: { $eq: [{ $size: '$childs' }, 0] } } },
          { $group: { _id: null, durationReal: { $sum: { $toDouble: '$duration' } } } },
          { $project: { tiempo: '$durationReal' } }
        ],
        as: 'totalTime'
      }
    })
    pipeline.push({
      $lookup: {
        from: 'task',
        let: { find: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$project', '$$find'] }, { $eq: ['$status', 'suspended'] }] } } },
          { $lookup: { from: 'task', localField: '_id', foreignField: 'parent', as: 'childs' } },
          { $match: { $expr: { $eq: [{ $size: '$childs' }, 0] } } },
          { $group: { _id: null, durationReal: { $sum: { $toDouble: '$duration' } } } },
          { $project: { tiempo: '$durationReal' } }
        ],
        as: 'suspendedTime'
      }
    })
    pipeline.push({
      $lookup: {
        from: 'task',
        let: { find: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$project', '$$find'] }] } } }
        ],
        as: 'tasks'
      }
    })
    pipeline.push({
      $project: {
        id: '$_id',
        planPeriod: '$planPeriod',
        manager: '$user._id',
        managerName: '$user.name',
        allUser: '$allUser',
        planName: '$plan.name',
        name: 1,
        tags: 1,
        suspendedTime: '$suspendedTime',
        totalTime: '$totalTime',
        tasks: '$tasks',
        completedTime: '$completedTime',
        startEnd: 1,
        status: 1,
        unitCode: '$unit.code',
        unitName: '$unit.name',
        unit: '$unit._id',
        duration: 1
      }
    })
    pipeline.push({ $sort: { name: 1 } })
    pipeline.push({ $skip: skip })
    pipeline.push({ $limit: limit })
    mongo.aggregate('project', pipeline, {}, (err, docs) => {
      if (err) throw err
      for (const i in docs) {
        docs[i].duration = docs[i].duration ? docs[i].duration : docs[i].totalTime[0] ? docs[i].totalTime[0].tiempo : 0
        docs[i].suspendedTime = docs[i].suspendedTime[0] ? docs[i].suspendedTime[0].tiempo : 0
        docs[i].completedTime = docs[i].completedTime[0] ? docs[i].completedTime[0].tiempo : 0
        docs[i].duration = docs[i].duration - docs[i].suspendedTime
        docs[i].realDuration = docs[i].completedTime
        docs[i].progress = docs[i].completedTime / parseFloat(docs[i].duration)
        if (docs[i].tasks && docs[i].tasks.length) {
          var datesStart = []
          var datesEnd = []
          for (var d in docs[i].tasks) {
            if (!docs[i].tasks[d].type || docs[i].tasks[d].type === 'task') {
              datesStart.push(new Date(docs[i].tasks[d].start_date).getTime())
              datesEnd.push(new Date(docs[i].tasks[d].end_date).getTime())
            }
          }
          var min = datesStart.length > 0 ? Math.min.apply(null, datesStart) : 0
          var max = datesEnd.length > 0 ? Math.max.apply(null, datesEnd) : 0
          if (min && max && min !== max) {
            docs[i].startEnd = dateformat(new Date(min), 'yyyy/mm/dd') + ' / ' + dateformat(new Date(max), 'yyyy/mm/dd')
          }
        }
        docs[i].realDuration = docs[i].realDuration ? docs[i].realDuration.toFixed(2) : 0
        docs[i].progress = docs[i].progress ? docs[i].progress * 100 : 0
        docs[i].manager = { user: docs[i].manager ? docs[i].manager[0] : '', name: docs[i].managerName ? docs[i].managerName[0] : '' }
        docs[i].planName = docs[i].planName[0]
        docs[i].unit = docs[i].unit[0]
        docs[i].unitName = docs[i].unitName ? docs[i].unitName[0] : ''
        let users = []
        for (const a in docs[i].allUser) {
          users.push(docs[i].allUser[a].name)
        }
        docs[i].users = users.join(',')
        var tagsId = docs[i].tags
        var usedTags = []
        if (tagsDoc.length > 0 && tagsId && tagsId.length > 0) {
          for (let t = 0; t < tagsDoc.length; t++) {
            if (tagsId.length) {
              for (let o = 0; o < tagsId.length; o++) {
                if (tagsDoc[t].id && tagsId[o] && tagsDoc[t].id.toString() === tagsId[o].toString()) {
                  usedTags.push(tagsDoc[t])
                }
              }
            } else {
              if (tagsDoc[t] && tagsId && tagsDoc[t].id.toString() === tagsId.toString()) {
                usedTags.push(tagsDoc[t])
              }
            }
          }
        }
        var tagscolor = []
        var tagsname = []
        var filterNames = [usedTags[0] ? usedTags[0].value : '']
        for (const i in usedTags) {
          tagscolor.push(usedTags[i].color)
          tagsname.push(usedTags[i].value)
        }
        docs[i].tagscolor = tagscolor
        docs[i].tagsname = tagsname
        docs[i].filterNames = filterNames
        if (docs[i].startEnd) {
          const dates = docs[i].startEnd.split(' / ')
          if (dates.length > 0 && dates[0].length > 6 && dates[1].length < 11 && !isNaN(Date.parse(dates[0]))) {
            docs[i].startDate = dateformat(new Date(dates[0]), 'yyyy/mm/dd')
          }
          if (dates.length > 1 && dates[1].length > 6 && dates[1].length < 11 && !isNaN(Date.parse(dates[1]))) {
            docs[i].endDate = dateformat(new Date(dates[1]), 'yyyy/mm/dd')
          }
        }
        // delete docs[i].content
      }
      reply.data = docs
      if (skip) {
        send(reply)
      } else {
        mongo.count('project', keys, (err, count) => {
          if (err) throw err
          reply.total_count = count
          send(reply)
        })
      }
    })
  }

  this.list = function (req, mongo, send) {
    var skip = parseInt(req.query.start) || 0
    var limit = parseInt(req.query.count) || 50
    var reply = { data: [], pos: skip }
    /* filering documents with user of session or unit of user of session and not hidden */
    var keys = {
      $or: [
        { 'actors.user': req.session.context.user }
      ]
    }
    if (req.session.context.managerUnits.length > 0) {
      keys.$or.push({ unit: { $in: req.session.context.managerUnits } })
    }
    if (req.session.context.assistantUnits.length > 0) {
      keys.$or.push({ unit: { $in: req.session.context.assistantUnits } })
    }
    if (req.session.context.dependentUnits.length > 0) {
      keys.$or.push({ unit: { $in: req.session.context.dependentUnits } })
    }
    if (req.session.context.readerUnits && req.session.context.readerUnits.length > 0) {
      keys.$or.push({
        $and: [
          { unit: { $in: req.session.context.readerUnits } },
          { status: { $in: ['archived', 'completed'] } }
        ]
      })
    }
    if (req.query.projGoals) {
      keys.$or.push({ unit: { $exists: 0 } })
      keys.$or.push({ unit: { $eq: '' } })
      limit = 1000
    }
    /* apply filter in parameters */
    const query = {}
    let matchStartEnd = {}
    var all = false
    if (req.query.filter) {
      if (req.query.filter.startDate === 'null') req.query.filter.startDate = ''
      if (req.query.filter.endDate === 'null') req.query.filter.endDate = ''
      for (const name in req.query.filter) {
        if (req.query.filter[name].length > 0) {
          if (name === 'manager') {
            const managers = req.query.filter.manager.split(','); // Array de managers separados por comas

            query.actors = {
              $elemMatch: {
                user: {
                  $in: managers.map(manager => mongo.toId(manager.trim()))
                },
                type: 'manager'
              }
            };
          }
          else if (name === 'name') {
            query[name] = { $regex: req.query.filter.name, $options: 'i' }
          } else if (name === 'unitCode') {
            const unitCodes = req.query.filter.unitCode.split(','); // Array de unitCodes separados por comas

            query.unit = {
              $in: unitCodes.map(unitCode => mongo.toId(unitCode.trim()))
            };
          }
          else if (name === 'planName') {
            const planNames = req.query.filter.planName.split(','); // Array de planNames separados por comas

            query.plan = {
              $in: planNames.map(plan => mongo.toId(plan.trim()))
            };
          }
          else if (name === 'path') {
            query.actors = { $elemMatch: { user: req.session._id, path: req.query.filter.path.indexOf(',') ? { $in: req.query.filter.path.split(',') } : req.query.filter.path } }
          } else if (name === '_id') {
            var ids = req.query.filter[name].split(',')
            for (const i in ids) {
              if (mongo.isNativeId(ids[i])) {
                ids[i] = mongo.toId(ids[i])
              }
            }
            query[name] = { $in: ids }
          } else if (req.query.filter[name] === 'all') {
            all = true
          } else {
            query[name] = req.query.filter[name].indexOf(',') !== -1 ? { $in: req.query.filter[name].split(',') } : new RegExp(req.query.filter[name].replace(/ /g, '.*'), 'i')
          }
        }
      }
      //filtrar inicio periodo del proyecto
      if (req.query.filter && req.query.filter.startDate && req.query.filter.startDate !== 'null') {
        function formatDate(date) {
          var d = new Date(date),
            month = '' + (d.getMonth() + 1),
            day = '' + d.getDate(),
            year = d.getFullYear();

          if (month.length < 2)
            month = '0' + month;
          if (day.length < 2)
            day = '0' + day;

          return [year, month, day].join('/');
        }
        let date = formatDate(req.query.filter.startDate)
        matchStartEnd.startDate = { $gte: date }
      }
      //filtrar fin periodo del proyecto
      if (req.query.filter && req.query.filter.endDate && req.query.filter.endDate !== 'null') {
        function formatDate(date) {
          var d = new Date(date),
            month = '' + (d.getMonth() + 1),
            day = '' + d.getDate(),
            year = d.getFullYear();

          if (month.length < 2)
            month = '0' + month;
          if (day.length < 2)
            day = '0' + day;

          return [year, month, day].join('/');
        }
        let date = formatDate(req.query.filter.endDate)
        matchStartEnd.endDate = { $lte: date }
      }
    }
    if (Object.keys(query).length > 0) {
      keys = { $and: [keys, query] }
    } else if (!all) {
      if ((req.session.context.readerUnits && req.session.context.readerUnits.length > 0) && !req.session.context.memberUnits.length) {
        keys = { $and: [keys] }
      } else {
        keys = { $and: [keys, { status: 'processing' }] }
      }
    }
    /* read limit rows from skip position */
    var pipeline = [
      { $match: keys },
      { $sort: { name: 1 } },
      { $skip: skip },
      { $limit: limit },
      { $addFields: { manager: { $filter: { input: '$actors', as: 'item', cond: { $in: ['manager', '$$item.type'] } } } } },
      { $lookup: { from: 'user', localField: 'manager.user', foreignField: '_id', as: 'user' } },
      { $lookup: { from: 'unit', localField: 'unit', foreignField: '_id', as: 'unit' } },
      { $lookup: { from: 'plan', localField: 'plan', foreignField: '_id', as: 'plan' } },
      {
        $lookup: {
          from: 'task',
          let: { project: '$_id', planPeriod: '$planPeriod' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$project', '$$project'] }, { $ne: ['$status', 'suspended'] }, { $or: [{ $eq: ['$type', 'task'] }, { $eq: ['$type', ''] }] }] } } },
            { $lookup: { from: 'task', localField: '_id', foreignField: 'parent', as: 'childs' } },
            { $match: { $expr: { $eq: [{ $size: '$childs' }, 0] } } },
            {
              $lookup: {
                from: 'time',
                let: { id: '$_id' },
                pipeline: [
                  { $match: { $expr: { $eq: ['$$id', '$document'] } } },
                  { $group: { _id: null, duration: { $sum: { $toDouble: '$duration' } } } }
                ],
                as: 'time'
              }
            },
            { $unwind: { path: '$time', preserveNullAndEmptyArrays: true } },
            {
              $group: {
                _id: null,
                inicio: { $min: '$start_date' },
                fin: { $max: '$end_date' },
                plan: { $sum: { $toDouble: '$duration' } },
                real: { $sum: { $toDouble: '$time.duration' } },
                realProgress: { $sum: { $toDouble: '$realProgress' } },
                totalTask: { $sum: 1 },
              }
            },
            {
              $addFields: {
                inicio: {
                  $cond: {
                    if: { $and: [{ $eq: [{ $type: '$inicio' }, 'string'] }, { $ne: ['$inicio', ''] }] },
                    then: { $dateFromString: { dateString: '$inicio', timezone: '-06:00' } },
                    else: '$inicio'
                  }
                },
                fin: {
                  $cond: {
                    if: { $and: [{ $eq: [{ $type: '$fin' }, 'string'] }, { $ne: ['$fin', ''] }] },
                    then: { $dateFromString: { dateString: '$fin', timezone: '-06:00' } },
                    else: '$fin'
                  }
                }
              }
            },
            {
              $project: {
                startEnd: {
                  $concat: [
                    {
                      $cond: {
                        if: { $ne: ['$inicio', ''] },
                        then: { $dateToString: { format: '%Y/%m/%d', date: '$inicio', timezone: '-06:00', onNull: 'unspecified' } },
                        else: {
                          $dateToString: {
                            format: '%Y/%m/%d',
                            date: {
                              $arrayElemAt: [
                                {
                                  $cond: {
                                    if: { $isArray: ['$$planPeriod'] },
                                    then: '$$planPeriod',
                                    else: []
                                  }
                                },
                                0
                              ]
                            },
                            timezone: '-06:00',
                            onNull: 'unspecified'
                          }
                        }
                      }
                    },
                    ' / ',
                    {
                      $cond: {
                        if: { $ne: ['$fin', ''] },
                        then: { $dateToString: { format: '%Y/%m/%d', date: '$fin', timezone: '-06:00', onNull: 'unspecified' } },
                        else: {
                          $dateToString: {
                            format: '%Y/%m/%d',
                            date: {
                              $arrayElemAt: [
                                {
                                  $cond: {
                                    if: { $isArray: ['$$planPeriod'] },
                                    then: '$$planPeriod',
                                    else: []
                                  }
                                },
                                1
                              ]
                            },
                            timezone: '-06:00',
                            onNull: 'unspecified'
                          }
                        }
                      }
                    },
                  ]
                },
                plan: { $ifNull: ['$plan', 0] },
                real: { $ifNull: ['$real', 0] },
                realProgress: { $ifNull: ['$realProgress', 0] },
                totalTask: { $ifNull: ['$totalTask', 0] }
              }
            }
          ],
          as: 'tasks'
        }
      },
      {
        $lookup: {
          from: 'task',
          let: { project: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$project', '$$project'] }, { $ne: ['$status', 'suspended'] }, { $or: [{ $eq: ['$type', 'task'] }, { $eq: ['$type', ''] }] }] } } },
            { $lookup: { from: 'task', localField: '_id', foreignField: 'parent', as: 'childs' } },
            { $match: { $expr: { $and: [{ $eq: [{ $size: '$childs' }, 0] }, { $in: ['$status', ['done', 'reviewed', 'completed', 'archived']] }] } } },
            {
              $lookup: {
                from: 'time',
                let: { id: '$_id' },
                pipeline: [
                  { $match: { $expr: { $eq: ['$$id', '$document'] } } },
                  { $group: { _id: null, duration: { $sum: { $toDouble: '$duration' } } } }
                ],
                as: 'time'
              }
            },
            { $unwind: { path: '$time', preserveNullAndEmptyArrays: true } },
            { $group: { _id: null, duration: { $sum: { $toDouble: '$duration' } }, real: { $sum: { $toDouble: '$time.duration' } } } },
            { $project: { duration: { $subtract: ['$duration', '$real'] } } }
          ],
          as: 'tasksCompleted'
        }
      },
      {
        $addFields: {
          realTime: { $arrayElemAt: ['$tasks.real', 0] },
          totalTime: { $arrayElemAt: ['$tasks.plan', 0] },
          realProgress: { $arrayElemAt: ['$tasks.realProgress', 0] },
          totalTask: { $arrayElemAt: ['$tasks.totalTask', 0] },
          startEnd: { $arrayElemAt: ['$tasks.startEnd', 0] }
        }
      },
      {
        $project: {
          id: '$_id',
          planPeriod: '$planPeriod',
          manager: { $arrayElemAt: ['$manager.user', 0] },
          managerName: { $arrayElemAt: ['$user.name', 0] },
          planName: { $arrayElemAt: ['$plan.name', 0] },
          name: 1,
          progress: {
            $cond: {
              if: { $in: ['$status', ['completed', 'archived']] },
              then: 100,
              else: {
                $cond: {
                  if: { $eq: ['$realTime', 0] },
                  then: 0,
                  else: { $multiply: [{ $divide: [{ $add: [{ $ifNull: [{ $arrayElemAt: ['$tasksCompleted.duration', 0] }, 0] }, '$realTime'] }, '$totalTime'] }, 100] }
                }
              }
            }
          },
          realProgress: { $ifNull: [{ $round: [{ $divide: ['$realProgress', '$totalTask'] }, 2] }, 0] },
          startEnd: 1,
          startDate: { $arrayElemAt: [{ $split: ['$startEnd', ' / '] }, 0] },
          endDate: { $arrayElemAt: [{ $split: ['$startEnd', ' / '] }, 1] },
          status: 1,
          unitCode: { $arrayElemAt: ['$unit.code', 0] },
          unitName: { $arrayElemAt: ['$unit.name', 0] },
          unit: { $arrayElemAt: ['$unit._id', 0] },
          duration: { $ifNull: [{ $round: [{ $divide: ['$totalTime', { $cond: ['$workDay', { $cond: [{ $eq: ['$workDay', NaN] }, 480, '$workDay'] }, 480] }] }, 2] }, 0] },
          durationReal: {
            $cond: {
              if: { $eq: ['$realTime', 0] },
              then: 0,
              else: {
                $ifNull: [
                  {
                    $round: [
                      { $divide: [{ $ifNull: ['$realTime', 0.00] }, { $cond: ['$workDay', { $cond: [{ $eq: ['$workDay', NaN] }, 480, '$workDay'] }, 480] }] },
                      2
                    ]
                  },
                  0.00
                ]
              }
            }
          }
        }
      },
      //match para filtrar periodo del proyecto
      {
        $match: matchStartEnd
      }
    ]
    if (req.query.projGoals) {
      pipeline[11].$project.name2 = { $ifNull: [{ $cond: { if: { $gte: [{ $strLenCP: '$name' }, 93] }, then: { $concat: [{ $substrCP: ['$name', 0, 90] }, '...'] }, else: '$name' } }, ''] }
    }
    mongo.aggregate('project', pipeline, {}, async (err, docs) => {
      if (err) throw err
      reply.data = docs
      if (skip) {
        send(reply)
      } else {
        mongo.aggregate('project', [{ $match: keys }, { $match: matchStartEnd }], { allowDiskUse: true }, (err, count) => {
          if (!err && count) {
            reply.total_count = count.length ? count.length : 0
          }
          send(reply)
        })
      }
    })
  }

  // Compute working days betheen dates
  this.restaFechas = function (f1, f2) {
    var dias = f2.diff(f1, 'days')
    return dias
  }

  this.showProjects = function (req, mongo, send) {
    mongo.userUnits(req.session._id, ['manager'], { createProjects: '1' }, (err, unitsUserManager) => {
      var units = []
      if (!err) {
        for (const i in unitsUserManager) {
          units.push({ unit: unitsUserManager[i]._id })
        }
      }
      mongo.find('project', { $or: units }, (err, docsManager) => {
        var ids = []
        if (!err) {
          for (const i in docsManager) {
            if (docsManager[i].actors.length !== 0) { ids.push(docsManager[i].actors[0].user) }
          }
        }
        mongo.find('project', { $and: [{ status: 'processing' }, { actors: { $elemMatch: { user: req.session._id } } }] }, (err, docs) => {
          if (!err) {
            for (const i in docs) {
              ids.push(docs[i].actors[0].user)
            }
          }
          mongo.find('project', { $and: [{ status: 'draft' }, { actors: { $elemMatch: { user: req.session._id } } }] }, (err, docsDraft) => {
            if (!err) {
              for (const i in docsDraft) {
                if (docsDraft[i].actors) { ids.push(docsDraft[i].actors[0].user) }
              }
            }
            mongo.find('project', { $and: [{ status: 'review' }, { actors: { $elemMatch: { user: req.session._id } } }] }, (err, docsReview) => {
              if (!err) {
                for (const i in docsReview) {
                  if (docsReview[i].actors) { ids.push(docsReview[i].actors[0].user) }
                }
              }

              for (const i in docsManager) {
                switch (docsManager[i].status) {
                  case 'processing':
                    if (docs.findIndex((x) => { return x._id.equals(docsManager[i]._id) }) === -1) { docs.push(docsManager[i]) }
                    break
                  case 'draft':
                    if (docsDraft.findIndex((x) => { return x._id.equals(docsManager[i]._id) }) === -1) { docsDraft.push(docsManager[i]) }
                    break
                  case 'review':
                    if (docsReview.findIndex((x) => { return x._id.equals(docsManager[i]._id) }) === -1) { docsReview.push(docsManager[i]) }
                    break
                }
              }

              mongo.toHash('user', { _id: { $in: ids } }, { _id: 1, name: 1 }, (err, users) => {
                var projects = []
                if (!err) {
                  for (const i in docs) {
                    var doc = docs[i]
                    var user = doc.actors.length !== 0 ? doc.actors[0].user.toString() : null
                    projects.push({
                      id: doc._id.toString(),
                      status: 'processing',
                      text: doc.name,
                      userId: user,
                      userName: user ? users[user].name : '',
                      startDate: doc.dates.start_date,
                      endDate: doc.dates.end_date,
                      duration: doc.duration + ' dias',
                      currentTask: doc.currentTask
                    })
                  }
                }
                for (const i in docsDraft) {
                  const doc = docsDraft[i]
                  const user = doc.actors.length !== 0 ? doc.actors[0].user.toString() : null
                  var d = this.restaFechas(new Date(), new Date(doc.dates.start_date))
                  if (d <= 2 && d >= 0) {
                    projects.push({
                      id: doc._id.toString(),
                      status: 'toStart',
                      text: doc.name,
                      userId: user,
                      userName: user ? users[user].name : '',
                      startDate: doc.dates.start_date,
                      endDate: doc.dates.end_date,
                      duration: doc.duration + ' dias'
                    })
                  }
                  if (d < 0) {
                    projects.push({
                      id: doc._id.toString(),
                      status: 'toStart',
                      text: doc.name,
                      userId: user,
                      userName: user ? users[user].name : '',
                      startDate: doc.dates.start_date,
                      endDate: doc.dates.end_date,
                      duration: doc.duration + ' dias',
                      $css: 'delayed'
                    })
                  }
                }
                for (const i in docsReview) {
                  const doc = docsReview[i]
                  const user = doc.actors.length !== 0 ? doc.actors[0].user.toString() : null
                  projects.push({
                    id: doc._id.toString(),
                    status: 'test',
                    text: doc.name,
                    userId: user,
                    userName: user ? users[user].name : '',
                    startDate: doc.dates.start_date,
                    endDate: doc.dates.end_date,
                    duration: doc.duration + ' dias',
                    $css: 'completed'
                  })
                }
                send(projects)
              })
            })
          })
        })
      })
    })
  }

  this.kanban = function (req, mongo, send) {
    var data = []
    var doc
    mongo.findOne('project', { _id: mongo.toId(req.query._id) }, (err, project) => {
      if (err) throw err
      mongo.toHash('user', {}, async (err, users) => {
        if (err) throw err
        let tasks = await new Promise(resolve => {
          let pipeline = [
            { $match: { project: project._id } },
            { $sort: { _id: -1 } },
            {
              $lookup: {
                from: 'document',
                let: {
                  find: { $ifNull: ['$documents', []] }
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [{
                          $in: ['$_id', '$$find']
                        }]
                      }
                    }
                  },
                  {
                    $count: 'count'
                  }
                ],
                as: 'aCount'
              }
            },
            {
              $lookup: {
                from: 'note',
                let: {
                  find: { $ifNull: ['$documents', []] }
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [{
                          $in: ['$_id', '$$find']
                        }]
                      }
                    }
                  },
                  {
                    $count: 'count'
                  }
                ],
                as: 'nCount'
              }
            },
            { $addFields: { aCount: { $sum: [{ $ifNull: [{ $arrayElemAt: ['$aCount.count', 0] }, 0] }, { $ifNull: [{ $arrayElemAt: ['$nCount.count', 0] }, 0] }] } } }
          ]
          mongo.aggregate('task', pipeline, { allowDiskUse: true }, (err, tasks) => {
            if (err) {
              console.log(err)
              resolve([])
            } else {
              resolve(tasks)
            }
          })
        })
        if (tasks && tasks.length) {
          for (var i in tasks) {
            if (tasks[i].type === 'task') {
              doc = tasks[i]
              var ownerId = doc.owner_id ? doc.owner_id.toString() : ''
              switch (tasks[i].status) {
                case 'processing':
                  data.push({
                    id: doc.id.toString(),
                    project: project._id,
                    status: 'processing',
                    text: doc.text,
                    userId: doc.owner_id ? doc.owner_id.toString() : '',
                    userName: users[ownerId] ? users[ownerId].name : '',
                    $css: 'processK',
                    startDate: doc.start_date ? moment(doc.start_date).format('DD/MM/YYYY') : '',
                    endDate: doc.end_date ? moment(doc.end_date).format('DD/MM/YYYY') : '',
                    duration: doc.duration ? (doc.duration / 60).toFixed(2) + ' <b>horas</b>' : 0 + ' <b>horas</b>',
                    count: doc.aCount ? doc.aCount : 0
                  })
                  break
                case 'done':
                  data.push({
                    id: doc.id.toString(),
                    project: project._id,
                    status: 'done',
                    text: doc.text,
                    userId: doc.owner_id ? doc.owner_id.toString() : '',
                    userName: users[ownerId] ? users[ownerId].name : '',
                    $css: 'completedK',
                    startDate: doc.start_date ? moment(doc.start_date).format('DD/MM/YYYY') : '',
                    endDate: doc.end_date ? moment(doc.end_date).format('DD/MM/YYYY') : '',
                    duration: doc.duration ? (doc.duration / 60).toFixed(2) + ' <b>horas</b>' : 0 + ' <b>horas</b>',
                    count: doc.aCount ? doc.aCount : 0
                  })
                  break
                case 'completed':
                  data.push({
                    id: doc.id.toString(),
                    project: project._id,
                    status: 'completed',
                    text: doc.text,
                    userId: doc.owner_id ? doc.owner_id.toString() : '',
                    userName: users[ownerId] ? users[ownerId].name : '',
                    $css: 'completedK',
                    startDate: doc.start_date ? moment(doc.start_date).format('DD/MM/YYYY') : '',
                    endDate: doc.end_date ? moment(doc.end_date).format('DD/MM/YYYY') : '',
                    duration: doc.duration ? (doc.duration / 60).toFixed(2) + ' <b>horas</b>' : 0 + ' <b>horas</b>',
                    count: doc.aCount ? doc.aCount : 0
                  })
                  break
                case 'paused':
                  data.push({
                    id: doc.id.toString(),
                    project: project._id,
                    status: 'paused',
                    text: doc.text,
                    userId: doc.owner_id ? doc.owner_id.toString() : '',
                    userName: users[ownerId] ? users[ownerId].name : '',
                    $css: 'pausedK',
                    startDate: doc.start_date ? moment(doc.start_date).format('DD/MM/YYYY') : '',
                    endDate: doc.end_date ? moment(doc.end_date).format('DD/MM/YYYY') : '',
                    duration: doc.duration ? (doc.duration / 60).toFixed(2) + ' <b>horas</b>' : 0 + ' <b>horas</b>',
                    count: doc.aCount ? doc.aCount : 0
                  })
                  break
                case 'suspended':
                  data.push({
                    id: doc.id.toString(),
                    project: project._id,
                    status: 'suspended',
                    text: doc.text,
                    userId: doc.owner_id ? doc.owner_id.toString() : '',
                    userName: users[ownerId] ? users[ownerId].name : '',
                    $css: 'suspendedK',
                    startDate: doc.start_date ? moment(doc.start_date).format('DD/MM/YYYY') : '',
                    endDate: doc.end_date ? moment(doc.end_date).format('DD/MM/YYYY') : '',
                    duration: doc.duration ? (doc.duration / 60).toFixed(2) + ' <b>horas</b>' : 0 + ' <b>horas</b>',
                    count: doc.aCount ? doc.aCount : 0
                  })
                  break
                case 'reviewed':
                  data.push({
                    id: doc.id.toString(),
                    project: project._id,
                    status: 'reviewed',
                    text: doc.text,
                    userId: doc.owner_id ? doc.owner_id.toString() : '',
                    userName: users[ownerId] ? users[ownerId].name : '',
                    $css: 'completedK',
                    startDate: doc.start_date ? moment(doc.start_date).format('DD/MM/YYYY') : '',
                    endDate: doc.end_date ? moment(doc.end_date).format('DD/MM/YYYY') : '',
                    duration: doc.duration ? (doc.duration / 60).toFixed(2) + ' <b>horas</b>' : 0 + ' <b>horas</b>',
                    count: doc.aCount ? doc.aCount : 0
                  })
                  break
                default:
                  data.push({
                    id: doc.id.toString(),
                    project: project._id,
                    status: 'draft',
                    text: doc.text,
                    userId: doc.owner_id ? doc.owner_id.toString() : '',
                    userName: users[ownerId] ? users[ownerId].name : '',
                    $css: 'delayedK',
                    startDate: doc.start_date ? moment(doc.start_date).format('DD/MM/YYYY') : '',
                    endDate: doc.end_date ? moment(doc.end_date).format('DD/MM/YYYY') : '',
                    duration: doc.duration ? (doc.duration / 60).toFixed(2) + ' <b>horas</b>' : 0 + ' <b>horas</b>',
                    count: doc.aCount ? doc.aCount : 0
                  })
              }
            }
          }
        }
        send(data)
      })
    })
  }

  this.kanbanTasks = function (req, mongo, send) {
    let skip = Number(req.query.skip) || 0
    var data = []
    var doc
    var keys = {
      $or: [
        { 'actors.user': req.session.context.user }
      ]
    }
    if (req.session.context.managerUnits.length > 0) {
      keys.$or.push({ unit: { $in: req.session.context.managerUnits } })
    }
    if (req.session.context.assistantUnits.length > 0) {
      keys.$or.push({ unit: { $in: req.session.context.assistantUnits } })
    }
    if (req.session.context.dependentUnits.length > 0) {
      keys.$or.push({ unit: { $in: req.session.context.dependentUnits } })
    }
    if (req.session.context.readerUnits && req.session.context.readerUnits.length > 0) {
      keys.$or.push({
        $and: [
          { unit: { $in: req.session.context.readerUnits } },
          { status: { $in: ['archived', 'completed'] } }
        ]
      })
    }

    /* apply filter in parameters */
    const query = {}
    let queryTask = { type: 'task' }
    if (req.query.filter) {
      for (const name in req.query.filter) {
        if (req.query.filter[name].length > 0 && req.query.filter[name] !== 'empty') {
          if (name === 'user' && req.query.filter.user.length === 24) {
            queryTask.owner_id = mongo.toId(req.query.filter.user)
          }
          if (name === 'unit' && req.query.filter.unit.length === 24) {
            query.unit = mongo.toId(req.query.filter.unit)
          }
          if (name === 'project' && req.query.filter.project.length === 24) {
            query._id = mongo.toId(req.query.filter.project)
          }
        }
      }
    }
    if (Object.keys(query).length > 0) {
      keys = { $and: [keys, query] }
    }
    mongo.find('project', keys, { _id: -1 }, (err, projects) => {
      if (err) throw err
      let ids = []
      if (projects.length) {
        for (const p in projects) {
          ids.push(projects[p]._id)
          queryTask.project = { $in: ids }
        }
      } else {
        queryTask.project = { $in: [] }
      }
      let pipeline = [
        {
          $match: queryTask
        },
        { $sort: { _id: -1 } },
        {
          $lookup: {
            from: 'document',
            let: {
              find: { $ifNull: [{ $cond: [{ $eq: ['$documents', '[]'] }, [], '$documents'] }, []] }
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{
                      $in: ['$_id', '$$find']
                    }]
                  }
                }
              },
              {
                $count: 'count'
              }
            ],
            as: 'aCount'
          }
        },
        {
          $lookup: {
            from: 'note',
            let: {
              find: { $ifNull: [{ $cond: [{ $eq: ['$documents', '[]'] }, [], '$documents'] }, []] }
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{
                      $in: ['$_id', '$$find']
                    }]
                  }
                }
              },
              {
                $count: 'count'
              }
            ],
            as: 'nCount'
          }
        },
        { $addFields: { aCount: { $sum: [{ $ifNull: [{ $arrayElemAt: ['$aCount.count', 0] }, 0] }, { $ifNull: [{ $arrayElemAt: ['$nCount.count', 0] }, 0] }] } } },
        { $skip: skip },
        { $limit: 200 },
        //{ $sort: { _id: -1 } }
      ]
      mongo.aggregate('task', pipeline, {}, (err, tasks) => {
        if (err) throw err
        mongo.toHash('user', {}, (err, users) => {
          if (err) throw err
          for (const i in tasks) {
            doc = tasks[i]
            var ownerId = doc.owner_id ? doc.owner_id.toString() : ''
            switch (tasks[i].status) {
              case 'processing':
                data.push({
                  id: doc.id.toString(),
                  project: doc.project,
                  status: 'processing',
                  text: doc.text,
                  userId: doc.owner_id ? doc.owner_id.toString() : '',
                  userName: users[ownerId] ? users[ownerId].name : '',
                  $css: 'processK',
                  startDate: doc.start_date ? moment(doc.start_date).format('DD/MM/YYYY') : '',
                  endDate: doc.end_date ? moment(doc.end_date).format('DD/MM/YYYY') : '',
                  deadline: doc.end_date ? new Date(doc.end_date).getTime() < new Date().getTime() ? true : false : false,
                  duration: doc.duration ? (doc.duration / 60).toFixed(2) + ' <b>horas</b>' : 0 + ' <b>horas</b>',
                  count: doc.aCount ? doc.aCount : 0
                })
                break
              case 'done':
                data.push({
                  id: doc.id.toString(),
                  project: doc.project,
                  status: 'done',
                  text: doc.text,
                  userId: doc.owner_id ? doc.owner_id.toString() : '',
                  userName: users[ownerId] ? users[ownerId].name : '',
                  $css: 'completedK',
                  startDate: doc.start_date ? moment(doc.start_date).format('DD/MM/YYYY') : '',
                  endDate: doc.end_date ? moment(doc.end_date).format('DD/MM/YYYY') : '',
                  deadline: doc.end_date ? new Date(doc.end_date).getTime() < new Date().getTime() ? true : false : false,
                  duration: doc.duration ? (doc.duration / 60).toFixed(2) + ' <b>horas</b>' : 0 + ' <b>horas</b>',
                  count: doc.aCount ? doc.aCount : 0
                })
                break
              case 'completed':
                data.push({
                  id: doc.id.toString(),
                  project: doc.project,
                  status: 'completed',
                  text: doc.text,
                  userId: doc.owner_id ? doc.owner_id.toString() : '',
                  userName: users[ownerId] ? users[ownerId].name : '',
                  $css: 'completedK',
                  startDate: doc.start_date ? moment(doc.start_date).format('DD/MM/YYYY') : '',
                  endDate: doc.end_date ? moment(doc.end_date).format('DD/MM/YYYY') : '',
                  deadline: doc.end_date ? new Date(doc.end_date).getTime() < new Date().getTime() ? true : false : false,
                  duration: doc.duration ? (doc.duration / 60).toFixed(2) + ' <b>horas</b>' : 0 + ' <b>horas</b>',
                  count: doc.aCount ? doc.aCount : 0
                })
                break
              case 'paused':
                data.push({
                  id: doc.id.toString(),
                  project: doc.project,
                  status: 'paused',
                  text: doc.text,
                  userId: doc.owner_id ? doc.owner_id.toString() : '',
                  userName: users[ownerId] ? users[ownerId].name : '',
                  $css: 'pausedK',
                  startDate: doc.start_date ? moment(doc.start_date).format('DD/MM/YYYY') : '',
                  endDate: doc.end_date ? moment(doc.end_date).format('DD/MM/YYYY') : '',
                  deadline: doc.end_date ? new Date(doc.end_date).getTime() < new Date().getTime() ? true : false : false,
                  duration: doc.duration ? (doc.duration / 60).toFixed(2) + ' <b>horas</b>' : 0 + ' <b>horas</b>',
                  count: doc.aCount ? doc.aCount : 0
                })
                break
              case 'suspended':
                data.push({
                  id: doc.id.toString(),
                  project: doc.project,
                  status: 'suspended',
                  text: doc.text,
                  userId: doc.owner_id ? doc.owner_id.toString() : '',
                  userName: users[ownerId] ? users[ownerId].name : '',
                  $css: 'suspendedK',
                  startDate: doc.start_date ? moment(doc.start_date).format('DD/MM/YYYY') : '',
                  endDate: doc.end_date ? moment(doc.end_date).format('DD/MM/YYYY') : '',
                  deadline: doc.end_date ? new Date(doc.end_date).getTime() < new Date().getTime() ? true : false : false,
                  duration: doc.duration ? (doc.duration / 60).toFixed(2) + ' <b>horas</b>' : 0 + ' <b>horas</b>',
                  count: doc.aCount ? doc.aCount : 0
                })
                break
              case 'reviewed':
                data.push({
                  id: doc.id.toString(),
                  project: doc.project,
                  status: 'reviewed',
                  text: doc.text,
                  userId: doc.owner_id ? doc.owner_id.toString() : '',
                  userName: users[ownerId] ? users[ownerId].name : '',
                  $css: 'completedK',
                  startDate: doc.start_date ? moment(doc.start_date).format('DD/MM/YYYY') : '',
                  endDate: doc.end_date ? moment(doc.end_date).format('DD/MM/YYYY') : '',
                  deadline: doc.end_date ? new Date(doc.end_date).getTime() < new Date().getTime() ? true : false : false,
                  duration: doc.duration ? (doc.duration / 60).toFixed(2) + ' <b>horas</b>' : 0 + ' <b>horas</b>',
                  count: doc.aCount ? doc.aCount : 0
                })
                break
              default:
                data.push({
                  id: doc.id.toString(),
                  project: doc.project,
                  status: 'draft',
                  text: doc.text,
                  userId: doc.owner_id ? doc.owner_id.toString() : '',
                  userName: users[ownerId] ? users[ownerId].name : '',
                  $css: 'delayedK',
                  startDate: doc.start_date ? moment(doc.start_date).format('DD/MM/YYYY') : '',
                  endDate: doc.end_date ? moment(doc.end_date).format('DD/MM/YYYY') : '',
                  deadline: doc.end_date ? new Date(doc.end_date).getTime() < new Date().getTime() ? true : false : false,
                  duration: doc.duration ? (doc.duration / 60).toFixed(2) + ' <b>horas</b>' : 0 + ' <b>horas</b>',
                  count: doc.aCount ? doc.aCount : 0
                })
            }
          }
          send(data)
        })
      })
    })
  }

  this.changeActor = function (req, mongo, send) {
    mongo.findId('project', req.query._id, (err, project) => {
      if (err || !project) send({ error: err })
      else {
        if (project.status !== 'completed') {
          for (const i in project.content.data) {
            if (project.content.data[i].owner_id && project.content.data[i].owner_id.toString() === req.query.oldUser) { project.content.data[i].owner_id = req.query.newUser }
          }
          for (const i in project.actors) {
            if (project.actors[i].user.toString() === req.query.oldUser) { project.actors[i].user = req.query.newUser }
          }
          mongo.find('document', { project: project._id, actors: { $elemMatch: { user: mongo.toId(req.query.oldUser), path: 'sent' } } }, async (err, documents) => {
            if (err) throw err
            for (const i in documents) {
              const doc = documents[i]
              var isOwner = doc.actors.findIndex((x) => { return x.path === 'sent' && x.user.toString() === req.query.oldUser.toString() })
              if (isOwner !== -1) {
                doc.actors[isOwner].user = req.query.newUser
                await new Promise(resolve => {
                  mongo.save('document', doc, (err) => {
                    if (!err) { resolve(true) } else { resolve(false) }
                  })
                })
              }
            }
            mongo.save('project', project, (err) => {
              if (err) send({ error: err })
              else {
                send({ message: tags.savedChanges })
              }
            })
          })
        } else {
          send({ msj: 'El proyecto se ha completado, por favor ingrese nuevamente para ver los cambios.' })
        }
      }
    })
  }

  this.canChangeActor = function (req, mongo, send) {
    mongo.findId('project', req.query._id, (err, project) => {
      if (err) send({ error: err })
      else {
        if (project.status !== 'completed') {
          var exists = false
          for (const i in project.content.data) {
            if (project.content.data[i].owner_id && project.content.data[i].owner_id.toString() === req.query.user.toString()) {
              exists = true
              break
            }
          }
          if (err) send({ error: err })
          else {
            send({ exists: exists })
          }
        } else {
          send({ msj: 'El proyecto se ha completado, por favor ingrese nuevamente para ver los cambios.' })
        }
      }
    })
  }

  this.completeProject = function (req, mongo, send) {
    mongo.findId('project', req.body._id, async (err, project) => {
      if (err) send({ error: err })
      else {
        let tasks = await new Promise(resolve => {
          mongo.find('task', { project: mongo.toId(project._id), type: 'task' }, {}, (err, tks) => {
            if (tks) {
              resolve(tks)
            } else {
              resolve([])
            }
          })
        })
        let continuar = true
        for (let i in tasks) {
          if (tasks[i].status !== 'reviewed' && tasks[i].status !== 'suspended') {
            continuar = false
          }
        }
        if (continuar) {
          if (project.realPeriod && !project.realPeriod.push) {
            project.realPeriod = [project.realPeriod]
          }
          project.realPeriod.push(new Date())
          project.status = 'completed'
          let tasks = await new Promise(resolve => {
            mongo.find('task', { project: mongo.toId(project._id), type: 'project' }, {}, (err, tks) => {
              if (tks) {
                resolve(tks)
              } else {
                resolve([])
              }
            })
          })
          for (var t in tasks) {
            let task = tasks[t]
            task.status = 'reviewed'
            let tasksKids = await new Promise(resolve => {
              mongo.find('task', { parent: task._id }, {}, (err, tks) => {
                if (tks) {
                  resolve(tks)
                } else {
                  resolve([])
                }
              })
            })
            let suspended = true
            for (let k in tasksKids) {
              if (tasksKids[k].status !== 'suspended') {
                suspended = false
                break
              }
            }
            if (suspended) task.status = 'suspended'
            await new Promise(resolve => { mongo.save('task', task, () => { resolve() }) })
          }
          mongo.save('project', project, (err) => {
            if (err) send({ error: err })
            else {
              project.id = project._id
              var users = []
              users.push(req.session.context.user.toString())
              for (const i in project.actors) {
                users.push(project.actors[i].user)
              }
              mongo.findId('plan', project.plan, async (err, plan) => {
                if (err) send({ error: err })
                else {
                  if (plan) {
                    var exit = false
                    for (const g in plan.goals) {
                      if (plan.goals[g].status === 'processing') {
                        for (const p in plan.goals[g].projects) {
                          if (plan.goals[g].projects[p].toString() === req.body._id) {
                            var res = await new Promise(resolve => {
                              mongo.find('project', { _id: { $in: plan.goals[g].projects }, status: 'completed' }, {}, {}, (err, pjts) => {
                                if (!err) {
                                  if (pjts.length === plan.goals[g].projects.length) { resolve(true) } else { resolve(false) }
                                }
                              })
                            })
                            if (res) { plan.goals[g].status = 'completed' }
                            exit = true
                            break
                          }
                        }
                        if (exit) { break }
                      }
                    }
                    mongo.save('plan', plan, (err) => {
                      if (err) {
                        send({ error: tags.savingProblema })
                      } else {
                        notification.send(req, req.session.context.room, 'planProjects.' + project.plan, project, null, null)
                        notification.send(req, '', 'dtproject', project, users, null)
                        send({ message: tags.savedChanges })
                      }
                    })
                  }
                }
              })
            }
          })
        } else {
          send({ err: 'Faltan tareas por revisar' })
        }
      }
    })
  }

  this.archiveProject = function (req, mongo, send) {
    mongo.findId('project', req.body._id, (err, project) => {
      if (err) send({ error: err })
      else {
        mongo.save('project', { _id: project._id, status: 'archived' }, (err) => {
          if (err) send({ error: err })
          else {
            project.id = project._id
            project.status = 'archived'
            var users = []
            users.push(req.session.context.user.toString())
            for (const i in project.actors) {
              users.push(project.actors[i].user)
            }
            notification.send(req, req.session.context.room, 'planProjects.' + project.plan, project, null, null)
            notification.send(req, '', 'dtproject', project, users, null)
            send({ message: tags.savedChanges })
            mongo.findId('plan', project.plan, async (err, plan) => {
              if (plan && plan.goals) {
                for (let i in plan.goals) {
                  if (plan.goals[i].projects && plan.goals[i].projects.length) {
                    let index = plan.goals[i].projects.findIndex(x => {
                      return x.toString() === project._id.toString()
                    })
                    let archived = true
                    if (index !== -1) {
                      for (let p in plan.goals[i].projects) {
                        await new Promise(resolve => {
                          mongo.findId('project', plan.goals[i].projects[p], async (err, project) => {
                            if (project && project.status !== 'archived') {
                              archived = false
                            }
                            resolve()
                          })
                        })
                        if (!archived) break
                      }
                    } else {
                      archived = false
                    }
                    if (archived) {
                      plan.goals[i].status = 'completed'
                      await new Promise(resolve => {
                        mongo.save('plan', { _id: plan._id, goals: plan.goals }, () => { resolve() })
                      })
                      notification.send(req, req.session.context.room, 'goal.' + plan._id.toString(), plan.goals[i], null, null)
                    }
                  }
                }
              }
            })
          }
        })
      }
    })
  }

  this.startProject = function (req, mongo, send) {
    mongo.findId('project', req.body._id, async (err, project) => {
      if (err) send({ error: err })
      else {
        if (project.auditable) {
          await new Promise(resolve => {
            mongo.findId('auditable', project.auditable, (err, auditable) => {
              if (err || !auditable) {
                console.log(err)
                resolve()
              } else {
                if (!auditable.plans || (auditable.plans && auditable.plans.length === 0)) auditable.plans = []
                const index = auditable.plans.findIndex((x) => {
                  return x.toString() === project.plan.toString()
                })
                if (index === -1) {
                  auditable.plans.push(project.plan)
                  mongo.save('auditable', { _id: auditable._id, plans: auditable.plans }, (err) => {
                    if (err) console.log(err)
                    resolve()
                  })
                } else {
                  resolve()
                }
              }
            })
          })
        }
        let continuar = true
        let tasks = await new Promise(resolve => {
          var pipeline = [
            { $match: { $expr: { $and: [{ $eq: ['$project', mongo.toId(project._id)] }, { $in: ['$type', ['milestone', 'task']] }] } } },
            { $lookup: { from: 'task', localField: '_id', foreignField: 'parent', as: 'childs' } },
            { $match: { $expr: { $eq: [{ $size: '$childs' }, 0] } } },
            { $sort: { start_date: 1, _id: 1 } }
          ]
          mongo.aggregate('task', pipeline, {}, async (err, tks) => {
            if (tks) {
              resolve(tks)
            } else {
              resolve([])
            }
          })
        })
        function replace(doc, tag, value) {
          doc.description = doc.description.replace(new RegExp('{{' + tag + '}}', 'g'), value)
        }
        let unit = project.unit
        if (unit && project.sequence && project.sequence.sequence) {
          unit = await new Promise(resolve => {
            mongo.findId('unit', unit, (err, unit) => {
              if (err) resolve(false)
              else resolve(unit)
            })
          })
          if (unit && unit.sequences && unit.sequences.length > 0) {
            var i = 0
            if (project.sequence && project.sequence.sequence) {
              i = unit.sequences.findIndex(x => x._id && x._id.equals(project.sequence.sequence))
            }
            if (i === -1) i = 0
            unit.sequences[i].code = unit.code
            await new Promise(resolve => {
              sequence.next(unit.sequences[i], mongo, 'project', async function (seq) {
                if (seq && seq.type === 'sequence') {
                  project.sequence.text = seq.text
                  project.sequence.value = seq.lastValue
                  project.sequence.sequence = seq._id
                  replace(project, 'sequence', seq.text)
                  project.name = seq.text + ' ' + project.name
                } else if (seq && seq.type === 'unit') {
                  const p = unit.sequences.findIndex((x) => { return x._id.toString() === seq._id.toString() })
                  unit.sequences[p].lastValue = seq.lastValue
                  if (seq.year) unit.sequences[p].year = seq.year
                  await new Promise(resolve => {
                    mongo.save('unit', unit, (err) => {
                      if (err) {
                        console.log(err)
                        resolve(false)
                      } else {
                        resolve(true)
                      }
                    })
                  })
                  project.sequence.text = seq.text
                  project.sequence.value = seq.lastValue
                  project.sequence.sequence = seq._id
                  replace(project, 'sequence', seq.text)
                  project.name = seq.text + ' ' + project.name
                }
                resolve(true)
              })
            })
          }
        }

        //req.body.content = project.content
        project.status = tags.processing
        var startend = project.startEnd ? project.startEnd.split(' / ') : ''
        project.planPeriod = [new Date(startend[0]), new Date(startend[1])]
        project.realPeriod = [new Date()]
        var data = tasks
        var links = []
        var taskSave = []
        for (let t in data) {
          for (let e in data) {
            if (new Date(data[e].start_date).toString() === new Date(data[t].start_date).toString()) {
              data[e].status = 'processing'
              data[e].color = '#808ff7'
              data[e].progressColor = '#3c4dc4'
              taskSave.push(data[e])
            }
            if (data[e].type === 'task' || data[e].type === 'milestone') {
              if (data[e].links && data[e].links.length) {
                for (let l in data[e].links) {
                  links.push(data[e].links[l])
                }
              }
            }
          }
          break
        }
        let contador = 0
        for (let t in data) {
          let exists = false
          if (data[t].type === 'task' || data[t].type === 'milestone') {
            for (let e in links) {
              if (contador === 0) {
                if (data[t].id.toString() === links[e].source.toString()) {
                  exists = true
                  break
                }
              } else {
                if (data[t].id.toString() === links[e].target.toString()) {
                  exists = true
                  break
                }
              }
            }
            if (data.length === 1 && !links.length) exists = true
            if (!exists) {
              continuar = false
              break
            }
            contador++
          }
        }
        if (continuar) {
          for (let t in taskSave) {
            await new Promise(resolve => {
              mongo.save('task', taskSave[t], (err) => {
                if (err) console.log(err)
                var evtTask = {
                  _id: mongo.newId(),
                  user: req.session.context.user,
                  date: new Date(),
                  event: 'statusChange',
                  collection: 'task',
                  docId: taskSave[t]._id,
                  data: taskSave[t].status,
                  project: project._id,
                  description: '<br>Cambió el estado de la tarea de Borrador a Proceso'
                }
                mongo.save('eventTask', evtTask, () => { resolve() })
              })
            })
          }
          mongo.findId('plan', project.plan, async (err, plan) => {
            if (err) send({ error: err })
            else {
              var doc
              if (plan) {
                doc = plan
                if (!doc.status || doc.status !== tags.processing) { doc.status = tags.processing }
                var exit = false
                for (const g in plan.goals) {
                  if (plan.goals[g].status === 'draft') {
                    for (const p in plan.goals[g].projects) {
                      if (plan.goals[g].projects[p].toString() === req.body._id) {
                        plan.goals[g].status = tags.processing
                        exit = true
                        break
                      }
                    }
                    if (exit) { break }
                  }
                }
                mongo.save('plan', doc, (err) => {
                  if (err) {
                    send({ error: tags.savingProblema })
                  } else {
                    mongo.findId('strategy', doc.strategy, (err, strategy) => {
                      if (err) send({ error: err })
                      else {
                        if (strategy) {
                          if (!strategy.status || strategy.status !== strategy.processing) { strategy.status = tags.processing }
                          mongo.save('strategy', strategy, (err) => {
                            if (err) {
                              send({ error: tags.savingProblema })
                            } else {
                              mongo.save('project', project, async (err) => {
                                if (err) {
                                  send({ error: tags.savingProblema })
                                } else {
                                  var reply = { message: tags.savedChanges }
                                  send(reply)
                                  project.id = project._id
                                  var startend = project.startEnd ? project.startEnd.split('/', 2) : ''
                                  project.startDate = startend[0]
                                  project.endDate = startend[1]
                                  var users = []
                                  users.push(req.session.context.user.toString())
                                  const toNoti = []
                                  const noti = {
                                    _id: mongo.newId(),
                                    actors: [],
                                    document: { id: project._id, status: project.status },
                                    collection: 'project',
                                    path: 'project.project',
                                    type: 3,
                                    user: req.session.context.user
                                  }
                                  noti.createdAt = noti._id.getTimestamp()
                                  for (const i in project.actors) {
                                    users.push(project.actors[i].user)
                                    noti.actors.push({ user: project.actors[i].user, seen: 0 })
                                    toNoti.push(project.actors[i].user)
                                  }
                                  var unit = await new Promise(resolve => {
                                    mongo.find('unit', { _id: project.unit }, {}, {}, (err, unit) => {
                                      if (unit && unit.length) {
                                        resolve(unit[0])
                                      } else {
                                        resolve(false)
                                      }
                                    })
                                  })
                                  if (unit && unit.actors && unit.actors.length) {
                                    for (let a in unit.actors) {
                                      if (unit.actors[a].type[0] === 'manager') {
                                        let ex = toNoti.findIndex((t) => {
                                          return t.toString() === unit.actors[a].user.toString()
                                        })
                                        if (ex === -1) {
                                          users.push(unit.actors[a].user)
                                          noti.actors.push({ user: unit.actors[a].user, seen: 0 })
                                          toNoti.push(unit.actors[a].user)
                                        }
                                      }
                                    }
                                  }
                                  await new Promise(resolve => {
                                    mongo.save('notification', noti, (err, result) => {
                                      if (!err) {
                                        resolve(result)
                                      }
                                    })
                                  })
                                  notification.send(req, req.session.context.room, 'badgeNotification', null, toNoti, null)
                                  notification.pushNotification(req, project, noti, toNoti)
                                  notification.notifyStart(req, mongo, project, toNoti)
                                  notification.send(req, req.session.context.room, 'Ggoal', project._id, null, null)
                                  notification.send(req, '', 'dtproject', project, users, null)
                                  notification.send(req, req.session.context.room, 'planProjects.' + project.plan, project, null, null)
                                }
                              })
                            }
                          })
                        } else {
                          send({ message: tags.unsaved + ' ' + tags.strategy })
                        }
                      }
                    })
                  }
                })
              } else {
                send({ message: tags.unsaved + ' ' + tags.plan })
              }
            }
          })
        } else {
          send({ message: 'err' })
        }
      }
    })
  }

  this.budget = function (req, mongo, send) {
    mongo.findId('project', req.query._id, (err, project) => {
      if (err || !project) {
        send([])
      } else {
        mongo.findId('plan', project.plan, (err, plan) => {
          if (err) throw err
          if (plan) {
            mongo.toHash('user', { business: { $exists: 1 } }, { business: 1 }, (err, users) => {
              if (err) throw err
              mongo.find('time', { project: project._id, user: { $exists: true } }, {}, {}, (err, times) => {
                if (err) throw err
                mongo.find('document', { project: project._id, type: 'expense' }, {}, {}, (err, documents) => {
                  if (err) throw err
                  mongo.find('project', { plan: plan._id }, async (err, projects) => {
                    if (err || !plan) {
                      send([])
                    } else {
                      let plannedCost = 0
                      let realCost = 0
                      let humanResource
                      let tasks = await new Promise(resolve => {
                        mongo.find('task', { project: mongo.toId(project._id) }, {}, (err, tks) => {
                          if (tks) {
                            resolve(tks)
                          } else {
                            resolve([])
                          }
                        })
                      })
                      let contentData = tasks
                      if (contentData.length > 0) {
                        for (const i in contentData) {
                          const task = contentData[i]
                          if (task.type === 'task' && task.owner_id && task.owner_id !== '') {
                            plannedCost = plannedCost + ((task.duration / 60) * (users[task.owner_id.toString()] && users[task.owner_id.toString()].business && users[task.owner_id.toString()].business.hourCost !== '' ? users[task.owner_id.toString()].business.hourCost : 0))
                          }
                        }
                        for (const i in times) {
                          if (times[i].cost && Number(times[i].cost) !== 0) {
                            realCost += Number(times[i].cost)
                          } else if (times[i].duration && user && user.business && user.business.hourCost) {
                            var user = users[times[i].user.toString()]
                            realCost += (Number(times[i].duration) * Number(user.business.hourCost) / 60)
                          }
                        }
                        humanResource = {
                          id: 'humanResource',
                          name: 'Presupuesto recurso humano',
                          amount: plannedCost,
                          real: realCost
                        }
                        humanResource.progress = humanResource.real / humanResource.amount
                        humanResource.progress = humanResource.progress * 100
                      }
                      var data = []
                      if (project.budget) {
                        for (const d in documents) {
                          var document = documents[d]
                          for (const c in document.content.details) {
                            var details = document.content.details[c]
                            for (const b in project.budget) {
                              var budget = project.budget[b]
                              if (budget.id === details.id && parseFloat(details.amount) > 0) {
                                budget.real = parseFloat(budget.real) + parseFloat(details.amount)
                                budget.progress = budget.real / parseFloat(budget.amount)
                                budget.progress = budget.progress * 100
                              }
                            }
                          }
                        }
                        for (const i in plan.budget) {
                          var remaining = parseFloat(plan.budget[i].amount)
                          const index = project.budget.findIndex((x) => {
                            return x.id === plan.budget[i].id
                          })
                          if (index === -1) {
                            project.budget.push({
                              id: plan.budget[i].id,
                              name: plan.budget[i].name,
                              amount: '0',
                              progress: 0,
                              real: 0
                            })
                          }
                          var result = this.remaining(projects, plan.budget[i].id, remaining)
                          project.budget[i].remaining = result
                        }
                        if (humanResource) {
                          const r = project.budget.findIndex((x) => {
                            return x.id === 'humanResource'
                          })
                          if (r !== -1) {
                            project.budget.splice(r, 1)
                          }
                          project.budget.push(humanResource)
                        }
                        send(project.budget || [])
                      } else {
                        for (const i in plan.budget) {
                          remaining = parseFloat(plan.budget[i].amount)
                          data.push({
                            id: plan.budget[i].id,
                            name: plan.budget[i].name,
                            amount: '0',
                            progress: 0,
                            real: 0
                          })
                          result = this.remaining(projects, plan.budget[i].id, remaining)
                          data[i].remaining = result
                        }
                        if (humanResource) {
                          data.push(humanResource)
                        }
                        send(data || [])
                      }
                    }
                  })
                })
              })
            })
          } else {
            send([])
          }
        })
      }
    })
  }
  this.remaining = function (projects, id, remaining) {
    for (const p in projects) {
      if (projects[p].budget && projects[p].budget.length) {
        for (const b in projects[p].budget) {
          if (projects[p].budget[b].id === id) {
            remaining = parseFloat(remaining) - parseFloat(projects[p].budget[b].amount)
          }
        }
      }
    }
    return remaining
  }

  this.budgetSave = function (req, mongo, send) {
    var project = req.body

    mongo.findId('project', project._id, (err, proj) => {
      if (err || !proj) {
        req.statusCode = 404
        send()
      } else {
        mongo.findId('plan', proj.plan, (err, plan) => {
          if (err || !plan) {
            req.statusCode = 404
            send()
          } else {
            mongo.find('project', { plan: plan._id }, (err, projects) => {
              if (err || !projects) {
                req.statusCode = 404
                send()
              } else {
                var sumBudgets = {}
                for (const i in projects) {
                  if (projects[i].budget && projects[i]._id.toString() !== proj._id.toString()) {
                    for (const j in projects[i].budget) {
                      if (sumBudgets[projects[i].budget[j].id]) { sumBudgets[projects[i].budget[j].id] = sumBudgets[projects[i].budget[j].id] + Number(projects[i].budget[j].amount) } else { sumBudgets[projects[i].budget[j].id] = Number(projects[i].budget[j].amount) }
                    }
                  }
                }

                for (const i in project.budget) {
                  project.budget[i].real = 0
                  project.budget[i].progress = 0
                  if (sumBudgets[project.budget[i].id]) { sumBudgets[project.budget[i].id] = sumBudgets[project.budget[i].id] + Number(project.budget[i].amount) } else { sumBudgets[project.budget[i].id] = Number(project.budget[i].amount) }
                }
                let flag = false
                for (const i in plan.budget) {
                  if (sumBudgets[plan.budget[i].id] && sumBudgets[plan.budget[i].id] > Number(plan.budget[i].amount)) {
                    const dif = sumBudgets[plan.budget[i].id] - Number(plan.budget[i].amount)
                    flag = true
                    send({ field: plan.budget[i].name, dif: dif, id: plan.budget[i].id })
                    break
                  }
                }

                if (!flag) {
                  mongo.save('project', project, (err, result) => {
                    if (err || !result) {
                      req.statusCode = 404
                      send()
                    } else {
                      for (const i in plan.budget) {
                        if (sumBudgets[plan.budget[i].id]) {
                          plan.budget[i].real = sumBudgets[plan.budget[i].id]
                        }
                      }
                      mongo.save('plan', plan, () => {
                        mongo.find('project', { plan: plan._id }, (err, projects) => {
                          if (err) throw err
                          for (const i in plan.budget) {
                            var remaining = (plan.budget[i].amount)
                            var result = this.remaining(projects, plan.budget[i].id, remaining)
                            project.budget[i].remaining = result
                          }
                          for (const i in project.budget) {
                            if (project.budget[i].id === req.query.form.id) {
                              req.query.form.remaining = project.budget[i].remaining
                              break
                            }
                          }
                          send({ saved: true })
                          notification.send(req, req.session.context.room, 'budgetP.' + project._id, req.query.form, null, null)
                        })
                      })
                    }
                  })
                }
              }
            })
          }
        })
      }
    })
  }

  this.expenses = function (req, mongo, send) {
    if (req.query._id) {
      mongo.findId('document', req.query._id, (err, document) => {
        if (err) {
          send([])
        } else {
          mongo.findId('project', document.project, (err, project) => {
            if (err || !project) {
              send([])
            } else {
              var data = []
              if (document.content.details) {
                for (const i in project.budget) {
                  const index = document.content.details.findIndex((x) => {
                    return x.id === project.budget[i].id
                  })
                  if (index === -1 && project.budget[i].id !== 'humanResource') {
                    document.content.details.push({
                      id: project.budget[i].id,
                      name: project.budget[i].name,
                      amount: '0',
                      progress: 0,
                      real: 0
                    })
                  }
                }
                send(document.content.details || [])
              } else {
                for (const i in project.budget) {
                  if (project.budget[i].id !== 'humanResource') {
                    data.push({
                      id: project.budget[i].id,
                      name: project.budget[i].name,
                      amount: '0',
                      progress: 0,
                      real: 0
                    })
                  }
                }
                send(data || [])
              }
            }
          })
        }
      })
    } else {
      mongo.findId('project', req.query.project, (err, project) => {
        if (err || !project) {
          send([])
        } else {
          mongo.findId('plan', project.plan, (err, plan) => {
            if (err) throw err
            var data = []
            if (project.budget) {
              for (const i in project.budget) {
                if (project.budget[i].id !== 'humanResource') {
                  data.push({
                    id: project.budget[i].id,
                    name: project.budget[i].name,
                    amount: '0',
                    progress: 0,
                    real: 0
                  })
                }
              }
              send(data || [])
            } else {
              for (const i in plan.budget) {
                data.push({
                  id: plan.budget[i].id,
                  name: plan.budget[i].name,
                  amount: '0',
                  progress: 0,
                  real: 0
                })
              }
              project.budget = plan.budget
              mongo.save('project', project, (err, result) => {
                if (!err || result) {
                  send(data || [])
                }
              })
            }
          })
        }
      })
    }
  }

  this.expensesSave = function (req, mongo, send) {
    var document = req.body
    var olders = document.olders
    delete document.olders
    var project = ''

    document.content.details.forEach(function (element, index) {
      for (const prop in document.content.details[index]) {
        if (prop.includes('$')) { delete document.content.details[index][prop] }
      }
    })

    if (document.tags) {
      document.tags = document.tags.length === 0 ? [] : document.tags.split(',')
    }

    mongo.findId('document', document._id, (err, doc) => {
      if (err) {
        req.statusCode = 404
        send()
      } else {
        if (!doc) { project = document.project } else {
          project = doc.project
          document.project = doc.project
        }

        mongo.findId('project', project, (err, project) => {
          if (err || !project) {
            req.statusCode = 404
            send()
          } else {
            mongo.find('document', { project: project._id, type: 'expense' }, (err, documents) => {
              if (err || !documents) {
                req.statusCode = 404
                send()
              } else {
                var sumBudgets = {}
                for (const i in documents) {
                  if (documents[i].content.details && documents[i]._id.toString() !== document._id.toString()) {
                    for (const j in documents[i].content.details) {
                      if (sumBudgets[documents[i].content.details[j].id]) {
                        sumBudgets[documents[i].content.details[j].id] = sumBudgets[documents[i].content.details[j].id] + Number(documents[i].content.details[j].amount)
                      } else {
                        sumBudgets[documents[i].content.details[j].id] = Number(documents[i].content.details[j].amount)
                      }
                    }
                  }
                }

                for (const i in document.content.details) {
                  if (sumBudgets[document.content.details[i].id]) { sumBudgets[document.content.details[i].id] = sumBudgets[document.content.details[i].id] + Number(document.content.details[i].amount) } else { sumBudgets[document.content.details[i].id] = Number(document.content.details[i].amount) }
                }
                let flag = false
                for (const i in project.budget) {
                  if (sumBudgets[project.budget[i].id] && sumBudgets[project.budget[i].id] > Number(project.budget[i].amount)) {
                    const dif = sumBudgets[project.budget[i].id] - Number(project.budget[i].amount)
                    flag = true
                    send({ field: project.budget[i].name, dif: dif, id: project.budget[i].id })
                    break
                  }
                }

                if (!flag) {
                  mongo.save('document', document, (err, result) => {
                    if (err || !result) {
                      req.statusCode = 404
                      send()
                    } else {
                      send({ saved: true })
                      notification.send(req, req.session.context.room, 'budgetP.' + project._id, { data: document.content.details, olders: olders }, null, null)
                      document.status = 'expense'
                      req.app.routes.document.sendNotification(req, mongo, send, document)
                    }
                  })
                }
              }
            })
          }
        })
      }
    })
  }

  this.setWorkDay = function (req, mongo, send) {
    var id = req.body._id
    if (id) {
      id = mongo.toId(id)
      mongo.save('project', { _id: id, workDay: 1 * req.body.workDay }, (err, result) => {
        if (err) {
          send({ error: err })
        } else {
          send()
        }
      })
    } else {
      send()
    }
  }

  this.getColumnsGantt = function (req, mongo, send) {
    var id = req.body._id
    if (id) {
      id = mongo.toId(id)
      mongo.findId('project', id, (err, result) => {
        if (err || !result) {
          console.log(err)
          send()
        } else {
          send(result.configColumnsGantt)
        }
      })
    } else {
      send()
    }
  }

  this.saveColumnsGantt = function (req, mongo, send) {
    var id = req.body._id
    var columns = req.body.columns
    if (id) {
      id = mongo.toId(id)
      mongo.save('project', { _id: id, configColumnsGantt: columns }, (err, result) => {
        if (err) {
          send({ error: err })
        } else {
          send()
        }
      })
    } else {
      send()
    }
  }

  this.save = async function (req, mongo, send) {
    var doc = req.body.values
    var workDay = req.body.workDay
    var task = req.body.task
    delete doc.realDuration
    if (!doc.content || (doc.name && !doc.content)) {
      delete doc.start_date
      delete doc.end_date
      if (!doc.status) {
        doc.status = tags.draft
      }
      var users = []
      var actors = []
      var units = []
      var tag = []
      var processes = []
      if ((doc.manager !== null) && (doc.manager.length !== 0)) {
        actors.push({
          user: doc.manager,
          type: [tags.manager]
        })
        users.push(mongo.toId(doc.manager))
        let workDay = 480
        let manager = await new Promise(resolve => {
          mongo.findId('user', mongo.toId(doc.manager), (err, user) => {
            if (err) {
              console.log(err)
              resolve()
            } else {
              resolve(user)
            }
          })
        })
        if (manager && manager.business && manager.business.workDay) {
          workDay = Number(manager.business.workDay)
        }
        doc.workDay = workDay
      }
      if ((doc.members !== null) && (doc.members.length !== 0)) {
        doc.members = doc.members.split(',')
        for (const i in doc.members) {
          if (doc.members[i] !== doc.manager) {
            actors.push({ user: doc.members[i], type: [tags.member] })
            users.push(mongo.toId(doc.members[i]))
          }
        }
      }
      units = doc.units.length >= 24 ? doc.units.split(',') : []
      tag = doc.tag.length >= 24 ? doc.tag.split(',') : []
      units = doc.units.length >= 24 ? doc.units.split(',') : []
      processes = doc.processes.length >= 24 ? doc.processes.split(',') : []
      doc.actors = actors
      doc.units = units
      doc.tag = tag
      doc.processes = processes
      delete doc.manager
      delete doc.members
    }
    if (doc.content && doc.name) delete doc.name
    if (!doc._id) {
      doc._id = doc.id
    }
    var exist = false
    let tasks = await new Promise(resolve => {
      mongo.find('task', { project: mongo.toId(doc._id) }, {}, (err, tks) => {
        if (tks) {
          resolve(tks)
        } else {
          resolve([])
        }
      })
    })
    if (tasks && tasks.length > 0) {
      var data = tasks
      var duration = 0
      let total = 0
      var datesStart = []
      var datesEnd = []
      for (let t in tasks) {
        let task = tasks[t]
        if (!task.type || task.type === 'task') {
          let wd = req.session.context.workDay
          if (task.user && task.user.length) {
            wd = task.user[0].business.workDay ? Number('0' + task.user[0].business.workDay) : wd
          }
          if (task.status === 'done') {
            total += parseFloat(task.duration) / wd
          }
          if (task.status !== 'suspended') {
            duration += (task.duration / wd)
          }
        }
      }
      doc.duration = duration.toFixed(2)
      doc.progress = total / parseFloat(duration)
      doc.progress = doc.progress ? doc.progress * 100 : 0

      if (data && data.length) {
        for (let i in data) {
          if (!data[i].type || data[i].type === 'task') {
            if (data[i].start_date && data[i].end_date) {
              datesStart.push(new Date(data[i].start_date).getTime())
              datesEnd.push(new Date(data[i].end_date).getTime())
            }
          }
        }
        var min, max
        if (datesStart.length) min = Math.min.apply(null, datesStart)
        if (datesEnd.length) max = Math.max.apply(null, datesEnd)
        if (doc.content && doc.content.data && doc.content.data.length > 0) {
          for (let t in data) {
            let task = data[t]
            var links = []
            if (doc.content && doc.content.links && doc.content.links.length > 0) {
              doc.content.links.forEach(l => {
                if (l.source.toString() === task.id.toString()) {
                  links.push(l)
                }
              })
            }
            if (doc.content && doc.content.data && doc.content.data.length > 0) {
              let index = doc.content.data.findIndex((x) => {
                return x.id.toString() === task.id.toString()
              })
              if (index !== -1) {
                if (doc.content.data[index].status !== task.status && (doc.content.data[index].status !== 'draft')) {
                  let objStatus = {
                    draft: 'Borrador',
                    processing: 'Proceso',
                    paused: 'Pausado',
                    suspended: 'Suspendido',
                    done: 'Terminado'
                  }
                  let description = '<br>Cambió el estado de la tarea de ' + objStatus[task.status] + ' a ' + objStatus[doc.content.data[index].status]
                  var evtTask = {
                    _id: mongo.newId(),
                    user: req.session.context.user,
                    date: new Date(),
                    event: 'statusChange',
                    collection: 'task',
                    docId: doc.content.data[index]._id,
                    data: doc.content.data[index].status,
                    project: doc._id,
                    description: description
                  }
                  await new Promise(resolve => {
                    mongo.save('eventTask', evtTask, () => { resolve() })
                  })
                }
                task.parent = doc.content.data[index].parent
                task.owner_id = doc.content.data[index].owner_id
                task.start_date = doc.content.data[index].start_date
                task.end_date = doc.content.data[index].end_date
                task.duration = doc.content.data[index].duration
                task.type = doc.content.data[index].type
                task.orden = index
                task.status = doc.content.data[index].status
                task.progressColor = doc.content.data[index].progressColor
                task.color = doc.content.data[index].color
              }
            }
            task.links = links
            await new Promise(resolve => {
              mongo.save('task', task, () => {
                resolve()
              })
            })
          }
        }
      }
      if (min && max) { doc.startEnd = dateformat(new Date(min), 'yyyy/mm/dd') + ' / ' + dateformat(new Date(max), 'yyyy/mm/dd') }
    } else if (tasks && tasks.length === 0) {
      exist = true
    }
    if (!exist) {
      mongo.findId('project', doc._id, (err, proj) => {
        if (err) throw err
        var owners
        var reviewed
        var docs = []
        var ids = []
        if (!proj) proj = doc
        for (const i in proj.actors) {
          ids.push(proj.actors[i].user.toString())
        }
        if (tasks && tasks.length > 0) {
          for (const d in tasks) {
            let data = tasks[d]
            delete data.realDuration
            if (data.type === 'task') {
              if (data.owner_id && ids.includes(data.owner_id)) {
                owners = true
              } else {
                delete data.owner_id
                owners = false
                break
              }
            }
          }
          for (const p in tasks) {
            let data3 = tasks[p]
            if (data3.type === 'task') {
              if (data3.status !== 'reviewed') {
                reviewed = false
                break
              } else if (data3.type === 'task') {
                reviewed = true
              }
            }
          }
          var newOwner, oldOwner
          for (const b in tasks) {
            let data3 = tasks[b]
            if (data3.id === req.query.taskId) {
              oldOwner = data3.owner_id
            }
          }
          for (const r in tasks) {
            let data2 = tasks[r]
            /* if (data2.id === req.query.taskId) {
              task = data2
            } */
            if (data2.id === req.query.taskId && data2.documents.length > 0) {
              for (const t in data2.documents) {
                docs.push(mongo.toId(data2.documents[t]))
              }
              newOwner = data2.owner_id
              break
            }
          }
        }
        delete doc.id
        var json = tasks
        mongo.find('document', { _id: { $in: docs } }, {}, {}, async (err, docums) => {
          if (err) throw err
          if (docums.length > 0 && newOwner !== oldOwner) {
            for (const m in docums) {
              docums[m].actors[0].user = newOwner
              await new Promise((resolve, reject) => {
                mongo.save('document', docums[m], (err, result) => {
                  if (err) { reject(err) } else { resolve(result) }
                })
              })
            }
          }
          this.getData(json, () => {
            mongo.save('project', doc, (err) => {
              var reply
              if (err) {
                reply = { error: tags.savingProblema }
              } else {
                reply = { message: tags.savedChanges }
              }
              reply.owners = owners
              reply.reviewed = reviewed
              send({ reply: reply, duration: doc.duration, startEnd: doc.startEnd })
              doc.id = doc._id
              try {
                if (doc.startEnd) {
                  const dates = doc.startEnd.split(' / ')
                  if (dates.length > 0 && dates[0].length > 6 && dates[1].length < 11) {
                    doc.startDate = dateformat(new Date(dates[0]), 'yyyy/mm/dd')
                  }
                  if (dates.length > 1 && dates[1].length > 6 && dates[1].length < 11) {
                    doc.endDate = dateformat(new Date(dates[1]), 'yyyy/mm/dd')
                  }
                }
              } catch (error) {
                var startend = doc.startEnd ? doc.startEnd.split('/', 2) : ''
                doc.startDate = startend[0]
                doc.endDate = startend[1]
              }
              if (doc.actors) { doc.actors.push({ user: req.session.context.user }) }
              for (const x in doc.actors) {
                // if (doc.status === 'processing')
                notification.send(req, req.session.context.room, 'dtproject', doc, [doc.actors[x].user], null)
                notification.send(req, req.session.context.room, 'planProjects.' + req.query.plan, doc, [doc.actors[x].user], null)
              }
              notification.send(req, req.session.context.room, 'kanban.' + proj.plan.toString(), { id: proj.plan }, null, null)
              notification.send(req, req.session.context.room, 'myKanban.' + doc._id.toString(), { id: doc._id }, null, null)
              if (req.query.taskId) {
                notification.send(req, req.session.context.room, 'ganttProj.' + doc._id.toString(), { id: req.query.taskId, task: task }, null, null)
                notification.send(req, req.session.context.room, 'task.' + req.query.taskId.toString(), { id: req.query.taskId, task: task }, null, null)
              }
              notification.send(req, req.session.context.room, 'myScheduler', { id: doc._id }, null, null)
            })
          })
        })
      })
    } else {
      send({ message: 'err' })
    }
  }

  this.getTask = function (req, mongo, send) {
    var project = req.query.project
    var task = req.query.task
    mongo.findId('task', task, (err, task) => {
      if (err) {
        console.log(err)
        send(err)
      } else {
        if (!task) {
          task = { id: mongo.newId() }
          task._id = task.id
        }
        mongo.findId('project', project, async (err, project) => {
          if (err) {
            console.log(err)
            send(err)
          } else {
            let realDuration = 0
            if (task) {
              var times = await new Promise(resolve => {
                if (task && project) {
                  mongo.find('time', { document: task._id, project: project._id }, async (err, times) => {
                    if (err) {
                      resolve(false)
                    } else {
                      resolve(times)
                    }
                  })
                } else {
                  resolve(false)
                }
              })
            }
            if (times) {
              for (let t in times) {
                if (times[t].duration) realDuration = realDuration + times[t].duration
              }
            }
            if (task) task.realDuration = Number(realDuration)
            var userIds = []
            for (const i in project.actors) {
              const actor = project.actors[i]
              userIds.push(actor.user)
              if (actor.type[0] === 'manager') {
                project.manager = actor.user
              } else {
                if (project.members) {
                  project.members.push(actor.user)
                } else {
                  project.members = [actor.user]
                }
              }
            }
            mongo.find('user', { _id: { $in: userIds } }, { name: 1, business: 1 }, (err, users) => {
              if (err) throw err
              if (users && users.length) {
                project.resources = []
                for (const i in users) {
                  const user = { id: users[i]._id, text: users[i].name }
                  project.resources.push(user)
                }
              }
              delete project.actors
              delete project.content
              if (!project.workDay) {
                project.workDay = 480
              }
              let data = {
                project: project
              }
              if (task) data.task = task
              send(data)
            })
          }
        })
      }
    })
  }

  this.saveTask = async function (req, mongo, send) {
    send({})
    var task = req.body.task
    task.calendar = 0
    task._id = task.id
    task.start_date = new Date(task.start_date)
    task.end_date = new Date(task.end_date)
    notification.send(req, req.session.context.room, 'task.' + task._id.toString(), { id: task._id, task: task }, null, null)
    notification.send(req, req.session.context.room, 'myKanban', { id: task._id, task: task }, null, null)
    notification.send(req, req.session.context.room, 'myKanban.' + task.project.toString(), { id: task._id }, null, null)
  }

  this.deleteTaskModel = async function (req, mongo, send) {
    let task = req.body
    req.app.routes.trash.insert(req, mongo, 'task', task, () => {
      send({})
    })
  }

  this.deleteTask = async function (req, mongo, send) {
    if (req.query.task && req.query.task.length === 13) {
      req.query.task = Number(req.query.task)
    }
    var task = await new Promise(resolve => {
      mongo.findId('task', req.query.task, async (err, task) => {
        if (err) {
          resolve(false)
        } else {
          resolve(task)
        }
      })
    })
    if (task) {
      let times = await new Promise(resolve => {
        mongo.find('time', { document: task._id, project: task.project }, async (err, times) => {
          if (err) {
            resolve(false)
          } else {
            resolve(times)
          }
        })
      })
      if (task.links && task.links.length) {
        send({ msg: 'Existen enlaces sobre esta tarea' })
      } else if (times && times.length) {
        send({ msg: 'Existen reportes de tiempo sobre esta tarea' })
      } else if (task.documents && task.documents.length) {
        send({ msg: 'Existen papeles de trabajo sobre esta tarea' })
      } else {
        if (task.type === 'project') {
          let parents = await new Promise(resolve => {
            mongo.find('task', { parent: task._id, project: task.project }, async (err, tasks) => {
              if (err) {
                resolve(false)
              } else {
                resolve(tasks)
              }
            })
          })
          for (let t in parents) {
            await new Promise(resolve => {
              mongo.deleteOne('task', { _id: parents[t]._id }, (err) => {
                if (err) {
                  resolve()
                } else {
                  req.app.routes.trash.insert(req, mongo, 'task', parents[t], () => {
                    resolve()
                  })
                }
              })
            })
          }
          mongo.deleteOne('task', { _id: task._id }, (err) => {
            if (err) {
              console.log(err)
              send(err)
            } else {
              req.app.routes.trash.insert(req, mongo, 'task', task, () => {
                send({})
              })
            }
          })
        } else {
          mongo.deleteOne('task', { _id: task._id }, (err) => {
            if (err) {
              console.log(err)
              send(err)
            } else {
              req.app.routes.trash.insert(req, mongo, 'task', task, () => {
                send({})
              })
            }
          })
        }
      }
    } else {
      send({})
    }
  }

  this.documentEvent = async function (req, mongo, send) {
    let data = req.body.data
    if (!data.isTrusted) {
      let description = ''
      let action = data[0]
      let document = data[1]
      let task = data[2]
      task = await new Promise(resolve => {
        mongo.findId('task', task, {}, {}, (err, task) => {
          if (err || !task) {
            resolve('')
          } else {
            resolve(task)
          }
        })
      })
      if (action === 'remove') {
        let name = await new Promise(resolve => {
          mongo.findId('document', document, {}, {}, (err, doc) => {
            if (err || !doc) {
              resolve('')
            } else {
              resolve(doc.name)
            }
          })
        })
        if (!name) {
          name = await new Promise(resolve => {
            mongo.findId('note', document, {}, {}, (err, doc) => {
              if (err || !doc) {
                resolve('')
              } else {
                resolve(doc.name)
              }
            })
          })
        } else if (!name) {
          name = await new Promise(resolve => {
            mongo.findId('template', document, {}, {}, (err, doc) => {
              if (err || !doc) {
                resolve('')
              } else {
                resolve(doc.name)
              }
            })
          })
        } else if (!name) {
          name = await new Promise(resolve => {
            mongo.findId('form', document, {}, {}, (err, doc) => {
              if (err || !doc) {
                resolve('')
              } else {
                resolve(doc.name)
              }
            })
          })
        } else if (!name) {
          name = await new Promise(resolve => {
            mongo.findId('bpd', document, {}, {}, (err, doc) => {
              if (err || !doc) {
                resolve('')
              } else {
                resolve(doc.name)
              }
            })
          })
        } else if (!name) {
          name = await new Promise(resolve => {
            mongo.findId('bpi', document, {}, {}, (err, doc) => {
              if (err || !doc) {
                resolve('')
              } else {
                resolve(doc.name)
              }
            })
          })
        }
        description = '<br>Se desvinculó un documento <p> ' + name
      } else if (action === 'link') {
        description = '<br>Se vincularon nuevos documentos a la tarea:'
        for (let i in document) {
          let doc = document[i]
          let name = await new Promise(resolve => {
            mongo.findId('document', doc, {}, {}, (err, doc) => {
              if (err || !doc) {
                resolve('')
              } else {
                resolve(doc.name)
              }
            })
          })
          if (!name) {
            name = await new Promise(resolve => {
              mongo.findId('note', doc, {}, {}, (err, doc) => {
                if (err || !doc) {
                  resolve('')
                } else {
                  resolve(doc.name)
                }
              })
            })
          } else if (!name) {
            name = await new Promise(resolve => {
              mongo.findId('template', doc, {}, {}, (err, doc) => {
                if (err || !doc) {
                  resolve('')
                } else {
                  resolve(doc.name)
                }
              })
            })
          } else if (!name) {
            name = await new Promise(resolve => {
              mongo.findId('form', doc, {}, {}, (err, doc) => {
                if (err || !doc) {
                  resolve('')
                } else {
                  resolve(doc.name)
                }
              })
            })
          } else if (!name) {
            name = await new Promise(resolve => {
              mongo.findId('bpd', doc, {}, {}, (err, doc) => {
                if (err || !doc) {
                  resolve('')
                } else {
                  resolve(doc.name)
                }
              })
            })
          } else if (!name) {
            name = await new Promise(resolve => {
              mongo.findId('bpi', doc, {}, {}, (err, doc) => {
                if (err || !doc) {
                  resolve('')
                } else {
                  resolve(doc.name)
                }
              })
            })
          }
          description += '<br> <p> ' + name
        }
      } else if (action === 'create') {
        let name = await new Promise(resolve => {
          mongo.findId('document', document, {}, {}, (err, doc) => {
            if (err || !doc) {
              resolve('')
            } else {
              resolve(doc.name)
            }
          })
        })
        description = '<br>Se creó un nuevo documento <p> ' + name
      }

      var evtTask = {
        _id: mongo.newId(),
        user: req.session.context.user,
        date: new Date(),
        event: 'documentChange',
        collection: 'task',
        docId: task._id,
        document: document,
        data: task.status,
        project: task.project,
        description: description
      }
      await new Promise(resolve => {
        mongo.save('eventTask', evtTask, () => { resolve() })
      })
    }
    send()
  }

  this.getData = function (array, next, index) {
    if (!index) {
      index = 0
    }
    if (array.length > index) {
      html.getData(array[index].description, (data) => {
        if (data.links.length > 0) {
          if (!array[index].documents) {
            array[index].documents = []
          }
          for (const i in data.links) {
            if (array[index].documents.indexOf(data.links[i]._id) === -1) {
              array[index].documents.push(data.links[i]._id)
            }
          }
        }
        this.getData(array, next, index + 1)
      })
    } else {
      next()
    }
  }
  this.deleteProject = function (req, mongo, send) {
    mongo.findId('project', req.query._id, (err, project) => {
      if (err) throw err
      var plan = project ? project.plan : ''
      if (project.status === 'draft' && plan) {
        mongo.deleteOne('project', { _id: mongo.toId(req.query._id) }, (err) => {
          if (err) {
            send(err)
          } else {
            project.idGoal = req.query.idGoal
            req.app.routes.trash.insert(req, mongo, 'project', project, async () => {
              send({})
              notification.send(req, req.session.context.room, 'kanban.' + plan.toString(), { id: plan })
              var tasks = await new Promise((resolve) => {
                mongo.find('task', { project: mongo.toId(req.query._id) }, (err, tasks) => {
                  if (err) { resolve([]) } else { resolve(tasks) }
                })
              })
              for (let i in tasks) {
                let task = tasks[i]
                await new Promise((resolve) => {
                  mongo.deleteOne('task', { _id: task._id }, (err) => {
                    if (err) {
                      console.log(err)
                      resolve()
                    } else {
                      req.app.routes.trash.insert(req, mongo, 'task', task, () => {
                        resolve()
                      })
                    }
                  })
                })
              }
            })
          }
        })
      } else {
        send({ msj: '_projectAlreadyStarted' }) // Projecto ya iniciado
      }
    })
  }
  this.deleteProjectIn = function (req, mongo, send) {
    var idGoal = ''
    mongo.findId('project', req.query._id, (err, project) => {
      if (err) throw err
      var plan = project ? project.plan : ''
      if (project.status === 'draft' && plan) {
        mongo.findId('plan', plan, (err, pln) => {
          if (err) throw err
          for (const i in pln.goals) {
            for (const p in pln.goals[i].projects) {
              if (req.query._id.toString() === pln.goals[i].projects[p].toString()) {
                pln.goals[i].projects.splice(p, 1)
                idGoal = pln.goals[i].id
                break
              }
            }
          }
          mongo.save('plan', { _id: pln._id, goals: pln.goals }, () => {
            mongo.deleteOne('project', { _id: mongo.toId(req.query._id) }, (err) => {
              if (err) {
                send(err)
              } else {
                project.idGoal = idGoal
                req.app.routes.trash.insert(req, mongo, 'project', project, async () => {
                  send({})
                  notification.send(req, req.session.context.room, 'planProjects.' + plan.toString(), { id: req.query._id }, null, true)
                  notification.send(req, req.session.context.room, 'dtproject', { id: req.query._id }, null, true)
                  notification.send(req, req.session.context.room, 'kanban.' + plan.toString(), { id: plan })
                  var tasks = await new Promise((resolve) => {
                    mongo.find('task', { project: mongo.toId(req.query._id) }, (err, tasks) => {
                      if (err) { resolve([]) } else { resolve(tasks) }
                    })
                  })
                  for (let i in tasks) {
                    let task = tasks[i]
                    await new Promise((resolve) => {
                      mongo.deleteOne('task', { _id: task._id }, (err) => {
                        if (err) {
                          console.log(err)
                          resolve()
                        } else {
                          task.hidden = true
                          req.app.routes.trash.insert(req, mongo, 'task', task, () => {
                            resolve()
                          })
                        }
                      })
                    })
                  }
                })
              }
            })
          })
        })
      } else {
        send({ msj: '_projectAlreadyStarted' })
      }
    })
  }
  this.addActors = function (req, id, actors, mongo, next) {
    mongo.findId('project', id, { actors: 1 }, (err, doc) => {
      if (err || !doc) {
        next(err)
      } else {
        for (const i in actors) {
          const rm = doc.actors.findIndex((actor) => { return actor.user === actors[i].user })
          if (rm === -1) {
            doc.actors.push({ user: actors[i].user, type: ['guest'] })
          }
        }
        mongo.save('project', doc, (err) => {
          next(err, doc)
        })
      }
    })
  }

  this.delegates = async function (req, mongo, send) {
    var tasks = await new Promise((resolve) => {
      mongo.find('task', { project: mongo.toId(req.query.project) }, (err, tasks) => {
        if (err) { resolve([]) } else { resolve(tasks) }
      })
    })
    var delegates = []
    var parent = ''; var docId = mongo.toId(req.query._id || req.query.template)
    for (const i in tasks) {
      const data = tasks[i]
      if ((req.query.task && data.id.toString() === req.query.task.toString()) || (data.documents && data.documents.findIndex((it) => {
        return it.toString() === docId.toString()
      }) !== -1)) {
        parent = data.parent
        delegates.push(data.owner_id)
        break
      }
    }
    for (const i in tasks) {
      const data = tasks[i]
      if (data.id === parent.toString()) {
        if (data.owner_id) { delegates.push(data.owner_id) }
        parent = data.parent
      }
    }
    send(delegates)
  }

  this.templatesTask = function (req, mongo, send) {
    var reply = { data: [] }
    mongo.find('params', { name: 'tag' }, { _id: 1, name: 1, options: 1 }, (er, tags) => {
      mongo.findId('project', req.query._id, async (err, project) => {
        if (err) throw err
        var idTemplates = []
        var keys = { $and: [{ type: { $nin: ['project', 'auditable'] } }, { $or: [{ units: project.unit }, { 'units.0': { $exists: 0 } }] }] }
        /* apply filter in parameters */
        let query = {}
        if (req.query.filter) {
          for (const name in req.query.filter) {
            if (req.query.filter[name].length > 0) {
              if (name === 'tags') {
                query.tags = mongo.toId(req.query.filter.tags)
              } else if (name === 'name') {
                query[name] = new RegExp(req.query.filter[name], 'i')
              } else {
                query[name] = req.query.filter[name].indexOf(',') !== -1 ? { $in: req.query.filter[name].split(',') } : new RegExp(req.query.filter[name].replace(/ /g, '.*'), 'i')
              }
            }
          }
        }
        if (!req.query.onlymodels || req.query.onlymodels === 'true') {
          var taskId = req.query.task
          await new Promise((resolve) => {
            mongo.findId('task', taskId, (err, task) => {
              if (err || !task) {
                resolve()
              } else {
                if (task.templates && task.templates.length) {
                  for (var i in task.templates) {
                    idTemplates.push(mongo.toId(task.templates[i]))
                  }
                }
                resolve()
              }
            })
          })
          if (idTemplates.length > 0) {
            keys = { _id: { $in: idTemplates } }
          }
        }
        keys = Object.keys(query).length > 0 ? { $and: [keys, query] } : keys
        mongo.find('template', keys, {}, { _id: 1 }, (err, temp) => {
          if (err) {
            send()
          } else {
            for (const i in temp) {
              var doc = temp[i]
              var tagsId = []
              for (const j in doc.tags) {
                tagsId.push(doc.tags[j])
              }
              var usedTags = []
              if (tags[0]) {
                for (let t = 0; t < tags[0].options.length; t++) {
                  for (let o = 0; o < tagsId.length; o++) {
                    if (tags[0].options[t].id.toString() === tagsId[o].toString()) {
                      usedTags.push(tags[0].options[t])
                    }
                  }
                }
              }
              var tagscolor = []
              var tagsname = []
              var filterNames = [usedTags[0] ? usedTags[0].value : '']
              for (const i in usedTags) {
                tagscolor.push(usedTags[i].color)
                tagsname.push(usedTags[i].value)
              }
              doc.id = doc._id
              doc.filter = !!doc.filter
              doc.tagscolor = tagscolor
              doc.tagsname = tagsname
              doc.filterNames = filterNames
              reply.data.push(doc)
            }
            send(reply)
          }
        })
      })
    })
  }

  this.saveFile = async function (req, mongo, send) { //antes se llamaba saveFile
    await new Promise(resolve => {
      mongo.savefile(req, async (err, result) => {
        if (!err) {
          send({ id: result.link, date: result.date, size: result.size, type: result.type, value: result.value })
        } else {
          send(err)
        }
        resolve()
      })
    })
  }

  this.restoreFile = function (req, mongo, send) {
    var sources = req.query.id.split(',')
    var project = req.query.project
    mongo.findId('project', project, async (err, project) => {
      if (!err && project) {
        for (const j in sources) {
          var source = sources[j]
          var folder = await this.buscarPorID(project.files, source);
          if (folder) {
            if (folder.value !== '/') {
              function restoreIndex(arr, id) {
                for (var i = 0; i < arr.length; i++) {
                  if (arr[i].id.toString() === id.toString() || arr[i].value.toString() === id.toString()) {
                    arr[i].remove = false
                    return true; // Se encontró el ID en el nivel actual
                  }

                  if (arr[i].data && arr[i].data.length > 0) {
                    var resultado = restoreIndex(arr[i].data, id);
                    if (resultado) {
                      return resultado; // Se encontró el ID en el nivel subyacente
                    }
                  }
                }

                return null; // No se encontró el ID en el arreglo
              }
              var restore = restoreIndex(project.files, source);
              if (restore) {
                mongo.save('project', project, (err) => {
                  function findParent(arr, id, parent) {
                    for (var i = 0; i < arr.length; i++) {
                      if (arr[i].id.toString() === id.toString() || arr[i].value.toString() === id.toString()) {
                        return parent; // Se encontró el ID en el nivel actual
                      }

                      if (arr[i].data && arr[i].data.length > 0) {
                        var resultado = findParent(arr[i].data, id, arr[i].value);
                        if (resultado) {
                          return resultado; // Se encontró el ID en el nivel subyacente
                        }
                      }
                    }

                    return null; // No se encontró el ID en el arreglo
                  }
                  var parent = findParent(project.files, source, '');
                  if (parent === '/') {
                    send({
                      "value": folder.value, "id": '/\/' + folder.id, "size": folder.size,
                      "date": Math.floor(new Date(folder.date).getTime() / 1000), "type": folder.type
                    })
                  } else {
                    send({
                      "value": folder.value, "id": "/" + parent + "/" + folder.id, "size": folder.size,
                      "date": Math.floor(new Date(folder.date).getTime() / 1000), "type": folder.type
                    })
                  }
                })
              } else {
                send({
                  invalid: true,
                  err: "Carpeta no permitida"
                })
              }
            } else {
              send({
                invalid: true,
                err: "Carpeta no permitida"
              })
              return
            }
          } else {
            send({
              invalid: true,
              err: "Some error message here"
            })
          }
        }
      } else {
        send({
          invalid: true,
          err: "Some error message here"
        })
      }
    })
  }

  this.removeFile = function (req, mongo, send) {
    var sources = req.query.id.split(',')
    var project = req.query.project
    mongo.findId('project', project, async (err, project) => {
      if (!err && project) {
        const ids = []
        for (const j in sources) {
          var source = sources[j]
          var folder = await this.buscarPorID(project.files, source);
          if (folder) {
            if (folder.value !== '/') {
              function borrarIndex(arr, id) {
                for (var i = 0; i < arr.length; i++) {
                  if (arr[i].id.toString() === id.toString() || arr[i].value.toString() === id.toString()) {
                    arr[i].remove = true
                    return true; // Se encontró el ID en el nivel actual
                  }

                  if (arr[i].data && arr[i].data.length > 0) {
                    var resultado = borrarIndex(arr[i].data, id);
                    if (resultado) {
                      return resultado; // Se encontró el ID en el nivel subyacente
                    }
                  }
                }

                return null; // No se encontró el ID en el arreglo
              }
              var borrado = borrarIndex(project.files, source);
              if (borrado) {
                mongo.save('project', project, (err) => { })
              }
              send(['ok'])
            } else {
              send({
                invalid: true,
                err: "Carpeta no permitida"
              })
              return
            }
          } else {
            send({
              invalid: true,
              err: "Some error message here"
            })
          }
        }
      } else {
        send({
          invalid: true,
          err: "Some error message here"
        })
      }
    })
  }

  this.deleteFile = function (req, mongo, send) {
    var sources = req.query.id.split(',')
    var project = req.query.project
    function findRow(source, files, value) {
      for (const i in files) {
        const row = files[i]
        if (row.id && row.id.toString() === source) {
          value.data = row
        }
        if (row.data) {
          findRow(source, row.data, value)
        }
      }
    }
    async function toDelete(ids, data, files, send) {
      for (const j in data) {
        var source = data[j].id
        if (source.toString().includes('&')) {
          if (data[j] && data[j].metadata && data[j].metadata) {
            if (data[j].metadata.actors[0] && data[j].metadata.actors[0].user && data[j].metadata.actors[0].user.toString() !== req.session.context.user.toString()) {
              send({
                invalid: true,
                err: "Usuario no permitido"
              })
              return
            }
            if (data[j].metadata.note) {
              await new Promise(resolve => {
                mongo.findId('note', data[j].metadata.note, (err, note) => {
                  if (err) {
                    resolve(false)
                  } else if (note && note.status !== 'draft') {
                    send({
                      invalid: true,
                      err: "La nota ya no esta en borrador"
                    })
                    return
                  } else {
                    resolve(true)
                  }
                })
              })
            }
            if (data[j].metadata.attached) {
              await new Promise(resolve => {
                mongo.findId('attached', data[j].metadata.attached, (err, attached) => {
                  if (err) {
                    resolve(false)
                  } else if (attached && attached.status !== 'prepared') {
                    send({
                      invalid: true,
                      err: "El anexo ya no esta en borrador"
                    })
                    return
                  } else {
                    resolve(true)
                  }
                })
              })
            }
            if (data[j].metadata.commitment) {
              await new Promise(resolve => {
                mongo.findId('commitment', data[j].metadata.commitment, (err, commitment) => {
                  if (err) {
                    resolve(false)
                  } else if (commitment && !['draft', 'returned'].includes(commitment.status)) {
                    send({
                      invalid: true,
                      err: "El compromiso ya no esta en borrador"
                    })
                    return
                  } else {
                    resolve(true)
                  }
                })
              })
            }
            if (data[j].metadata.evidence) {
              await new Promise(resolve => {
                mongo.findId('evidence', data[j].metadata.evidence, (err, evidence) => {
                  if (err) {
                    resolve(false)
                  } else if (evidence && !['draft'].includes(evidence.status)) {
                    send({
                      invalid: true,
                      err: "La evidencia ya no esta en borrador"
                    })
                    return
                  } else {
                    resolve(true)
                  }
                })
              })
            }
          }
          ids.push(source.toString().split('=')[1].split('&')[0])
        } else {
          let row = {
            data: false
          }
          findRow(source.toString(), files, row)
          if (row.data && row.data.data) {
            toDelete(ids, row.data.data, files, send)
          }
        }

      }
    }
    async function deleteids(ids, i) {
      await new Promise(resolve => {
        mongo.removefile(ids[i], (err) => {
          if (!err) {
            resolve(true)
          } else {
            resolve(false)
          }
        })
      })
      if (i < ids.length - 1) {
        i = i + 1
        deleteids(ids, i)
      }
    }
    mongo.findId('project', project, async (err, project) => {
      if (!err && project) {
        const ids = []
        for (const j in sources) {
          var source = sources[j]
          var folder = await this.buscarPorID(project.files, source);
          if (folder) {
            if (folder.value !== '/') {
              if (source.toString().includes('&')) {
                let row = {
                  data: false
                }
                findRow(source, project.files, row)
                if (row.data && row.data.metadata && row.data.metadata) {
                  if (row.data.metadata.actors[0] && row.data.metadata.actors[0].user && row.data.metadata.actors[0].user.toString() !== req.session.context.user.toString()) {
                    send({
                      invalid: true,
                      err: "Usuario no permitido"
                    })
                    return
                  }
                  if (row.data.metadata.note) {
                    await new Promise(resolve => {
                      mongo.findId('note', row.data.metadata.note, (err, note) => {
                        if (err) {
                          resolve(false)
                        } else if (note && note.status !== 'draft') {
                          send({
                            invalid: true,
                            err: "La nota ya no esta en borrador"
                          })
                          return
                        } else {
                          resolve(true)
                        }
                      })
                    })
                  }
                  if (row.data.metadata.attached) {
                    await new Promise(resolve => {
                      mongo.findId('attached', row.data.metadata.attached, (err, attached) => {
                        if (err) {
                          resolve(false)
                        } else if (attached && attached.status !== 'prepared') {
                          send({
                            invalid: true,
                            err: "El anexo ya no esta en borrador"
                          })
                          return
                        } else {
                          resolve(true)
                        }
                      })
                    })
                  }
                  if (row.data.metadata.commitment) {
                    await new Promise(resolve => {
                      mongo.findId('commitment', row.data.metadata.commitment, (err, commitment) => {
                        if (err) {
                          resolve(false)
                        } else if (commitment && !['draft', 'returned'].includes(commitment.status)) {
                          send({
                            invalid: true,
                            err: "El compromiso ya no esta en borrador"
                          })
                          return
                        } else {
                          resolve(true)
                        }
                      })
                    })
                  }
                  if (row.data.metadata.evidence) {
                    await new Promise(resolve => {
                      mongo.findId('evidence', row.data.metadata.evidence, (err, evidence) => {
                        if (err) {
                          resolve(false)
                        } else if (evidence && !['draft'].includes(evidence.status)) {
                          send({
                            invalid: true,
                            err: "La evidencia ya no esta en borrador"
                          })
                          return
                        } else {
                          resolve(true)
                        }
                      })
                    })
                  }
                }
                var id = source.toString().split('=')[1].split('&')[0]
                await new Promise(resolve => {
                  mongo.removefile(id, (err) => {
                    if (!err) { resolve(true) } else { resolve(false) }
                  })
                })
              } else {
                if (project.files) {
                  let row = {
                    data: false
                  }
                  findRow(source, project.files, row)
                  if (row.data && row.data.data) {
                    toDelete(ids, row.data.data, project.files, send)
                    if (ids.length) {
                      deleteids(ids, 0)
                    }
                  }
                }
              }

              function borrarIndex(arr, id) {
                for (var i = 0; i < arr.length; i++) {
                  if (arr[i].id.toString() === id.toString() || arr[i].value.toString() === id.toString()) {
                    arr.splice(i, 1);
                    return true; // Se encontró el ID en el nivel actual
                  }

                  if (arr[i].data && arr[i].data.length > 0) {
                    var resultado = borrarIndex(arr[i].data, id);
                    if (resultado) {
                      return resultado; // Se encontró el ID en el nivel subyacente
                    }
                  }
                }

                return null; // No se encontró el ID en el arreglo
              }
              var borrado = borrarIndex(project.files, source);
              if (borrado) {
                mongo.save('project', project, (err) => { })
              }
            } else {
              send({
                invalid: true,
                err: "Carpeta no permitida"
              })
              return
            }
          }
        }
        send(['ok'])
      } else {
        send({})
      }
    })
  }
  this.copyFile = function (req, mongo, send) {
    let doc = req.query
    mongo.findId('project', doc.project, async (err, project) => {
      if (!err && project) {
        var file = await this.buscarPorID(project.files, doc.id);
        if (file) {
          function buscarFolder(arr, folder, id, to) {
            for (var i = 0; i < arr.length; i++) {
              if (arr[i].id.toString() === id.toString() || arr[i].value.toString() === id.toString()) {
                if (folder.toString() !== to.toString()) {
                  return folder; // Se encontró el ID en el nivel actual
                } else {
                  return null
                }
              }

              if (arr[i].data && arr[i].data.length > 0) {
                var resultado = buscarFolder(arr[i].data, arr[i].id, id, to);
                if (resultado) {
                  return resultado; // Se encontró el ID en el nivel subyacente
                }
              }
            }

            return null; // No se encontró el ID en el arreglo
          }
          var folder = buscarFolder(project.files, '', doc.id, doc.to);
          if (folder) {
            //copia de file en mongo
            let copiaFile = {}
            let fileMongo = false
            if (file.data) {
              fileMongo = true
              copiaFile = {
                id: mongo.newId(),
                value: file.value,
                type: file.type,
                size: file.size,
                date: new Date(),
                recent: new Date(),
                data: []
              }
            } else {
              fileMongo = await new Promise(resolve => {
                var match = file.id.toString().match(/_id=([^&]+)/);
                var idExtraido = match ? match[1] : null;
                mongo.copyfileDocumentManager(idExtraido, mongo.newId(), (err, link) => {
                  if (link) resolve(link)
                  else resolve(false)
                })
              })
              copiaFile = {
                id: fileMongo,
                value: file.value,
                type: file.type,
                size: file.size,
                date: new Date(),
                recent: new Date(),
                reference: fileMongo,
                metadata: file.metadata
              }
            }
            //agregarlo a la nueva pocision
            function addFile(arr, id, fl) {
              for (var i = 0; i < arr.length; i++) {
                if (arr[i].id.toString() === id.toString() || arr[i].value.toString() === id.toString()) {
                  if (arr[i].data && arr[i].data.length) {
                    let lastFolderIndex = -1;

                    for (let index in arr[i].data) {
                      if (arr[i].data[index].type === 'folder') {
                        lastFolderIndex = parseInt(index);
                      }
                    }
                    if (lastFolderIndex !== -1) {
                      arr[i].data.splice(lastFolderIndex + 1, 0, fl);
                    } else {
                      arr[i].data.push(fl)
                    }
                  } else {
                    arr[i].data = [fl]
                  }
                  return true; // Se encontró el ID en el nivel actual
                }

                if (arr[i].data && arr[i].data.length > 0) {
                  var resultado = addFile(arr[i].data, id, fl);
                  if (resultado) {
                    return resultado; // Se encontró el ID en el nivel subyacente
                  }
                }
              }

              return null; // No se encontró el ID en el arreglo
            }
            var add = addFile(project.files, doc.to, copiaFile);
            if (add && fileMongo) {
              mongo.save('project', project, (err) => { })
              send({
                "value": copiaFile.value, "id": "/" + doc.to + "/" + copiaFile.value, "size": copiaFile.size,
                "date": Math.floor(new Date().getTime() / 1000), "type": copiaFile.type
              })
            } else {
              send({
                invalid: true,
                err: "Some error message here"
              })
            }
          } else {
            send({
              invalid: true,
              err: "Some error message here"
            })
          }
        } else {
          send({
            invalid: true,
            err: "Some error message here"
          })
        }
      } else {
        send({
          invalid: true,
          err: "Some error message here"
        })
      }
    })
  }
  this.moveFile = function (req, mongo, send) {
    let doc = req.query
    mongo.findId('project', doc.project, async (err, project) => {
      if (!err && project) {
        var file = await this.buscarPorID(project.files, doc.id);
        if (file) {
          function buscarFolder(arr, folder, id, to) {
            for (var i = 0; i < arr.length; i++) {
              if (arr[i].id.toString() === id.toString() || arr[i].value.toString() === id.toString()) {
                if (folder.toString() !== to.toString()) {
                  return folder; // Se encontró el ID en el nivel actual
                } else {
                  return null
                }
              }

              if (arr[i].data && arr[i].data.length > 0) {
                var resultado = buscarFolder(arr[i].data, arr[i].id, id, to);
                if (resultado) {
                  return resultado; // Se encontró el ID en el nivel subyacente
                }
              }
            }

            return null; // No se encontró el ID en el arreglo
          }
          var folder = buscarFolder(project.files, '', doc.id, doc.to);
          if (folder) {
            //encontra para borrarlo de la pocision
            function removeFile(arr, id) {
              for (var i = 0; i < arr.length; i++) {
                if (arr[i].id.toString() === id.toString() || arr[i].value.toString() === id.toString()) {
                  let fl = arr[i]
                  arr.splice(i, 1);
                  fl.recent = new Date()
                  return fl; // Se encontró el ID en el nivel actual
                }

                if (arr[i].data && arr[i].data.length > 0) {
                  var resultado = removeFile(arr[i].data, id);
                  if (resultado) {
                    return resultado; // Se encontró el ID en el nivel subyacente
                  }
                }
              }

              return null; // No se encontró el ID en el arreglo
            }
            var removed = removeFile(project.files, doc.id);
            //agregarlo a la nueva pocision
            function addFile(arr, id, fl) {
              for (var i = 0; i < arr.length; i++) {
                if (arr[i].id.toString() === id.toString() || arr[i].value.toString() === id.toString()) {
                  if (arr[i].data && arr[i].data.length) {
                    let lastFolderIndex = -1;

                    for (let index in arr[i].data) {
                      if (arr[i].data[index].type === 'folder') {
                        lastFolderIndex = parseInt(index);
                      }
                    }
                    if (lastFolderIndex !== -1) {
                      arr[i].data.splice(lastFolderIndex + 1, 0, fl);
                    } else {
                      arr[i].data.push(fl)
                    }
                  } else {
                    arr[i].data = [fl]
                  }
                  return true; // Se encontró el ID en el nivel actual
                }

                if (arr[i].data && arr[i].data.length > 0) {
                  var resultado = addFile(arr[i].data, id, fl);
                  if (resultado) {
                    return resultado; // Se encontró el ID en el nivel subyacente
                  }
                }
              }

              return null; // No se encontró el ID en el arreglo
            }
            var add = addFile(project.files, doc.to, removed);
            if (add) {
              mongo.save('project', project, (err) => { })
              send({
                "value": removed.value, "id": "/" + doc.to + "/" + removed.value, "size": removed.size,
                "date": Math.floor(new Date().getTime() / 1000), "type": removed.type
              })
            } else {
              send({
                invalid: true,
                err: "Some error message here"
              })
            }
          } else {
            send({
              invalid: true,
              err: "Some error message here"
            })
          }
        } else {
          send({
            invalid: true,
            err: "Some error message here"
          })
        }
      } else {
        send({
          invalid: true,
          err: "Some error message here"
        })
      }
    })
  }
  this.renameFile = async function (req, mongo, send) {
    let project = req.query.project
    function findRow(source, files, value) {
      for (const i in files) {
        const row = files[i]
        if (row.id.toString() === source) {
          value.data = row
        }
        if (row.data) {
          findRow(source, row.data, value)
        }
      }
    }
    mongo.findId('project', project, async (err, project) => {
      if (!err && project) {
        var folder = await this.buscarPorID(project.files, req.query.id);
        if (folder) {
          if (folder.value !== '/') {
            if (req.query.id.split('=')[1]) {
              var idFile = req.query.id.split('=')[1].split('&')[0]
              var id = req.query.id
              var row = {
                data: false
              }
              findRow(id, project.files, row)
              if (row.data && row.data.metadata) {
                await new Promise(resolve => {
                  mongo.save('fs.files', { _id: mongo.toId(idFile), filename: req.query.name }, (err, result) => {
                    if (!err) {
                      function renameFolder(arr, id, nm) {
                        for (var i = 0; i < arr.length; i++) {
                          if (arr[i].id.toString() === id.toString() || arr[i].value.toString() === id.toString()) {
                            arr[i].value = nm;
                            arr[i].recent = new Date();
                            return true; // Se encontró el ID en el nivel actual
                          }

                          if (arr[i].data && arr[i].data.length > 0) {
                            var resultado = renameFolder(arr[i].data, id, nm);
                            if (resultado) {
                              return resultado; // Se encontró el ID en el nivel subyacente
                            }
                          }
                        }

                        return null; // No se encontró el ID en el arreglo
                      }
                      var change = renameFolder(project.files, req.query.id, req.query.name);
                      if (change) {
                        mongo.save('project', project, (err) => { })
                      }
                      resolve(true)
                    } else {
                      resolve(false)
                    }
                  })
                })
                if (row.data.metadata.actors[0].user.toString() !== req.session.context.user.toString()) {
                  send(['error'])
                  return
                } else if (row.data.metadata.note) {
                  await new Promise(resolve => {
                    mongo.findId('note', row.data.metadata.note, (err, note) => {
                      if (err) {
                        resolve(false)
                      } else if (note && note.status !== 'draft') {
                        send(['error'])
                        return
                      } else {
                        resolve(true)
                      }
                    })
                  })
                } else if (row.data.metadata.attached) {
                  await new Promise(resolve => {
                    mongo.findId('attached', row.data.metadata.attached, (err, attached) => {
                      if (err) {
                        resolve(false)
                      } else if (attached && attached.status !== 'prepared') {
                        send(['error'])
                        return
                      } else {
                        resolve(true)
                      }
                    })
                  })
                } else if (row.data.metadata.commitment) {
                  await new Promise(resolve => {
                    mongo.findId('commitment', row.data.metadata.commitment, (err, commitment) => {
                      if (err) {
                        resolve(false)
                      } else if (commitment && !['draft', 'returned'].includes(commitment.status)) {
                        send(['error'])
                        return
                      } else {
                        resolve(true)
                      }
                    })
                  })
                } else if (row.data.metadata.evidence) {
                  await new Promise(resolve => {
                    mongo.findId('evidence', row.data.metadata.evidence, (err, evidence) => {
                      if (err) {
                        resolve(false)
                      } else if (evidence && !['draft'].includes(evidence.status)) {
                        send(['error'])
                        return
                      } else {
                        resolve(true)
                      }
                    })
                  })
                } else {
                  send({
                    "invalid": false, "error": "", "id": req.query.name
                  })
                }
              } else {
                await new Promise(resolve => {
                  mongo.save('fs.files', { _id: mongo.toId(idFile), filename: req.query.name }, (err, result) => {
                    if (!err) {
                      function renameFolder(arr, id, nm) {
                        for (var i = 0; i < arr.length; i++) {
                          if (arr[i].id.toString() === id.toString() || arr[i].value.toString() === id.toString()) {
                            arr[i].value = nm;
                            return true; // Se encontró el ID en el nivel actual
                          }

                          if (arr[i].data && arr[i].data.length > 0) {
                            var resultado = renameFolder(arr[i].data, id, nm);
                            if (resultado) {
                              return resultado; // Se encontró el ID en el nivel subyacente
                            }
                          }
                        }

                        return null; // No se encontró el ID en el arreglo
                      }
                      var change = renameFolder(project.files, req.query.id, req.query.name);
                      if (change) {
                        mongo.save('project', project, (err) => { })
                      }
                      resolve(true)
                    } else {
                      resolve(false)
                    }
                  })
                })
                send({
                  "invalid": false, "error": "", "id": req.query.name
                })
              }
            } else {
              function renameFolder(arr, id, nm) {
                for (var i = 0; i < arr.length; i++) {
                  if (arr[i].id.toString() === id.toString() || arr[i].value.toString() === id.toString()) {
                    arr[i].value = nm;
                    return true; // Se encontró el ID en el nivel actual
                  }

                  if (arr[i].data && arr[i].data.length > 0) {
                    var resultado = renameFolder(arr[i].data, id, nm);
                    if (resultado) {
                      return resultado; // Se encontró el ID en el nivel subyacente
                    }
                  }
                }

                return null; // No se encontró el ID en el arreglo
              }
              var change = renameFolder(project.files, req.query.id, req.query.name);
              if (change) {
                mongo.save('project', project, (err) => { })
              }
              send({})
            }
          } else {
            send({
              invalid: true,
              err: "Carpeta no valida"
            })
          }
        } else {
          send({
            invalid: true,
            err: "Error"
          })
        }
      } else {
        send(['error'])
      }
    })
  }
  this.infoFile = async function (req, mongo, send) {
    send({})
  }
  this.folders = function (req, mongo, send) {
    var project = req.query.id
    if (project.includes('folders')) {
      project = project.replace('folders', '')
    }
    mongo.findId('project', project, async (err, project) => {
      if (!err && project) {
        if (project.files) {
          if (project.files.length) {
            if (!project.files[0].id) {
              project.files[0].id = mongo.newId()
              await new Promise(resolve => {
                mongo.save('project', project, (err) => { resolve() })
              })
            }
            function filterFolders(array) {
              return array.filter(item => {
                if (item.type === 'folder') {
                  if (item.data) {
                    item.data = filterFolders(item.data);
                  }
                  return true;
                }
                return false;
              });
            }
            project.files = filterFolders(project.files)
          }
          send(project.files)
        } else {
          let folder = [
            {
              id: mongo.newId(), value: '/', open: true, type: 'folder', date: new Date(), data: []
            }
          ]
          project.files = folder
          mongo.save('project', project, (err) => {
            if (!err) {
              send(folder)
            } else {
              send([])
            }
          })
        }
      } else {
        send(err)
      }
    })
  }
  this.files = function (req, mongo, send) {
    var project = req.query.id
    if (project.includes('folders')) {
      project = project.replace('folders', '')
    }
    mongo.findId('project', project, async (err, project) => {
      if (!err && project) {
        if (project.files) {
          if (!project.files[0].id) {
            project.files[0].id = mongo.newId()
            await new Promise(resolve => {
              mongo.save('project', project, (err) => { resolve() })
            })
          }
          let data = []
          if (project.files.length) {
            data = project.files
            function findAndExtract(array, value) {
              for (let i = 0; i < array.length; i++) {
                const item = array[i];
                if (item.value === value || (/*item.id &&*/ item.id.toString() === value)) {
                  if (item.data) {
                    let newData = []
                    for (let d in item.data) {
                      if (!item.data[d].remove) {
                        newData.push(item.data[d])
                      }
                    }
                    item.data = newData
                  }
                  return item.data || [];
                } else if (item.data) {
                  const result = findAndExtract(item.data, value);
                  if (result.length > 0) {
                    return result;
                  }
                }
              }
              return [];
            }
            if (req.query.file !== '/') {
              var result = findAndExtract(project.files, req.query.file);
              if (result.length > 0) {
                const extractedData = result.map(item => item.data);
              }
              data = result
              if (req.query.search) {
                data = data.filter(objeto => objeto.value.includes(req.query.search));
              }
            } else if (req.query.source === 'favorite') {
              data = []
              function findFavorite(array) {
                for (let i = 0; i < array.length; i++) {
                  const item = array[i];
                  if (item.star) {
                    data.push(item)
                  }
                  if (item.data) {
                    findFavorite(item.data)
                  }
                }
                return
              }
              findFavorite(project.files)
            } else if (req.query.source === 'recent') {
              data = []
              function findRecent(array) {
                for (let i = 0; i < array.length; i++) {
                  const item = array[i];
                  if (item.recent) {
                    data.push(item)
                  }
                  if (item.data) {
                    findRecent(item.data)
                  }
                }
                return
              }
              findRecent(project.files)
              data.sort(function (a, b) {
                return b.recent.getTime() - a.recent.getTime();
              });
              data = data.slice(0, 10);
            } else if (req.query.source === 'shared') {
              data = []
            } else if (req.query.source === 'trash') {
              data = []
              function findTrash(array) {
                for (let i = 0; i < array.length; i++) {
                  const item = array[i];
                  if (item.remove) {
                    data.push(item)
                  }
                  if (item.data) {
                    findTrash(item.data)
                  }
                }
                return
              }
              findTrash(project.files)
            }
          }
          send(data)
        } else {
          let folder = [
            {
              id: mongo.newId(), value: '/', open: true, type: 'folder', date: new Date(), data: []
            }
          ]
          project.files = folder
          mongo.save('project', project, (err) => {
            if (!err) {
              send(folder)
            } else {
              send([])
            }
          })
        }
      } else {
        send(err)
      }
    })
  }
  this.makedir = function (req, mongo, send) {
    var dir = req.query
    var newFolder = {
      value: dir.name,
      type: "folder",
      size: 0,
      date: new Date(),
      id: mongo.newId(),
      recent: new Date(),
      data: []
    }
    mongo.findId('project', mongo.toId(dir.project), { files: 1 }, async (err, project) => {
      if (!err && project) {
        if (project.files && project.files.length > 0 && project.files[0].data) {

          var folder = await this.buscarPorID(project.files, dir.id);

          if (folder) {
            if (folder.data && folder.data.length) {
              let lastFolderIndex = -1;

              for (let index in folder.data) {
                if (folder.data[index].type === 'folder') {
                  lastFolderIndex = parseInt(index);
                }
              }
              if (lastFolderIndex !== -1) {
                folder.data.splice(lastFolderIndex + 1, 0, newFolder);
              } else {
                folder.data.unshift(newFolder)
              }
            } else {
              folder.data = [newFolder]
            }
          } else {
            let lastFolderIndex = -1;

            for (let index in project.files[0].data) {
              if (project.files[0].data[index].type === 'folder') {
                lastFolderIndex = parseInt(index);
              }
            }
            if (lastFolderIndex !== -1) {
              project.files[0].data.splice(lastFolderIndex + 1, 0, newFolder);
            } else {
              project.files[0].data.unshift(newFolder)
            }
          }
        } else {
          project.files = [
            {
              value: '/',
              open: true,
              type: 'folder',
              date: new Date(),
              data: [
                newFolder
              ]
            }
          ]
        }
        mongo.save('project', project, (err) => {
          if (!err) {
            send({
              "value": newFolder.value, "id": newFolder.id, "size": newFolder.size,
              "date": Math.floor(folder.date.getTime() / 1000), "type": newFolder.type
            })
          } else {
            send({
              invalid: true,
              err: "Error"
            })
          }
        })
      } else {
        send({
          invalid: true,
          err: "Error"
        })
      }
    })
  }
  this.favoriteFile = function (req, mongo, send) {
    var data = req.query
    mongo.findId('project', mongo.toId(data.project), { files: 1 }, async (err, project) => {
      if (!err && project) {
        if (project.files && project.files.length > 0 && project.files[0].data) {
          var folder = await this.buscarPorID(project.files, data.id);

          if (folder) {
            folder.star = JSON.parse(data.star)
            mongo.save('project', project, (err) => {
              if (!err) {
                send({ invalid: false, error: "", id: data.id })
              } else {
                send({
                  invalid: true,
                  err: "Error"
                })
              }
            })
          } else {
            send({})
          }
        } else {
          send({})
        }
      } else {
        send({
          invalid: true,
          err: "Error"
        })
      }
    })
  }
  this.tagsFile = async function (req, mongo, send) {
    var tags = await new Promise(resolve => {
      mongo.find('params', { name: 'tag' }, { _id: 1, name: 1, options: 1 }, (err, tagsDoc) => {
        if (err || (tagsDoc && tagsDoc.length === 0)) {
          console.log(err)
          resolve([])
        } else {
          for (let i in tagsDoc[0].options) {
            tagsDoc[0].options[i].name = tagsDoc[0].options[i].value
          }
          resolve(tagsDoc[0].options)
        }
      })
    })
    send(tags)
  }
  this.getTagsFile = async function (req, mongo, send) {
    var data = req.query
    mongo.findId('project', mongo.toId(data.project), { files: 1 }, async (err, project) => {
      if (!err && project) {
        if (project.files && project.files.length > 0 && project.files[0].data) {
          var folder = await this.buscarPorID(project.files, data.id);

          if (folder) {
            if (folder.metadata && folder.metadata.tags) {
              send(folder.metadata.tags)
            } else {
              send([])
            }
          } else {
            send([])
          }
        } else {
          send([])
        }
      } else {
        send([])
      }
    })
  }
  this.setTagsFile = async function (req, mongo, send) {
    var data = req.query
    var tags = []
    if (data.value) tags = data.value.split(',')
    mongo.findId('project', mongo.toId(data.project), { files: 1 }, async (err, project) => {
      if (!err && project) {
        if (project.files && project.files.length > 0 && project.files[0].data) {
          var folder = await this.buscarPorID(project.files, data.id);

          if (folder) {
            if (folder.metadata) {
              folder.metadata.tags = tags
            } else {
              folder.metadata = {
                tags: tags
              }
            }
            mongo.save('project', project, (err) => {
              if (!err) {
                send({ invalid: false, error: "", id: data.id })
              } else {
                send({
                  invalid: true,
                  err: "Error"
                })
              }
            })
          } else {
            send([])
          }
        } else {
          send([])
        }
      } else {
        send([])
      }
    })
  }
  this.usersComments = async function (req, mongo, send) {
    var data = req.query
    mongo.findId('project', mongo.toId(data.project), { actors: 1 }, async (err, project) => {
      if (!err && project) {
        let users = []
        if (project.actors) {
          let ids = []
          for (let a of project.actors) {
            ids.push(a.user)
          }
          await new Promise(resolve => {
            mongo.find('user', { _id: { $in: ids } }, { name: 1, email: 1 }, (err, result) => {
              if (result && result.length) {
                for (let r of result) {
                  users.push({
                    id: r._id,
                    name: r.name,
                    email: r.email,
                    avatar: '/userImage?size=24&_id=' + r._id
                  })
                }
              }
              resolve()
            })
          })
        }
        if (users.length) {
          let index = users.findIndex(obj => obj.id.toString() === req.session.context.user.toString());
          if (index !== -1) {
            const person = users.splice(index, 1)[0];
            users.unshift(person);
          }
        }
        send(users)
      } else {
        send([])
      }
    })
  }
  this.userImage = async function (req, mongo, send) {
    req.app.routes.user.image(req, mongo, (res) => {
      send(res)
    })
  }
  this.previewUrl = async function (req, mongo, send) {
    mongo.getfile(req.query._id, async (err, stream, file) => {
      if (!err) {
        function isImage(filename) {
          const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
          const lowerCaseFilename = filename.toLowerCase();
          return imageExtensions.some(ext => lowerCaseFilename.endsWith(`.${ext}`));
        }
        if (file.filename && isImage(file.filename)) {
          send(stream)
        } else {
          let img = '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cDsELu6ostr6vW37xc9/zp750Aet5eucqvJrfeXTDBZhRYPJduNnXZe1321Z9T1on7HPf/bnbGtzw7Ka7wFuLxsMq7q73bXh0CsXtj/gFrQeUeO9HJZ+Obc//dqf2+v/8I+2sbFhraIY3cvvNzoHJo5/uFsKXL84HA7sySeesB/+oX9pP/2TP67tLFHx1hG4fAvwbtqZsvB1JYGLXRt3p0mdFfbaa6/Zt/7p/9ny2qoVnbaVg+vbdoFJ0srbVnmD86n3HbFPfvL77d98+l9ZXfabG321yboTt0PgYvduaLiPp73IKrOi3Y4Rmlne8iv8TmWziwQwaaoYme+ffq9m24XCd3i9AUrg4g4IXOyewvSG6lb0AdI+uepK07m2aWlfXWASleWwmQBGXcfesIxxCzoBuzAOXAZN4c5uCtsxrYAUuJnf3LlhWy4waYrCg9Z/FLStIjeP3NEtwO5R4eKOYkVz02dDv41jeDxyE5hYalX6p14fc30XNHKfagW7RYWLXbtVQ+zGeCVsMfE0AjnCNn5hxYl7wucGAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAECFwAABIgcAEASIDABQAgAQIXAIAEskFZ1d1u1waDgbVa5C8AAA9SVVXWbretVVd1XJFlWZwDAIAHZ5yv2WBY1WVVWu2521zZBDAAALhfmedr7fnql/qDclTietQqdclbAAAeDAWt0lZFba8/bKI3kjbTbQAA4AFoalj9P7P/DyyZa9c1yhFoAAAAAElFTkSuQmCC'
          const imageBuffer = Buffer.from(img, 'base64');
          send(imageBuffer)
        }
      } else {
        send()
      }
    })
  }
  this.commentsFile = async function (req, mongo, send) {
    var data = req.query
    mongo.findId('project', mongo.toId(data.project), { files: 1 }, async (err, project) => {
      if (!err && project) {
        if (project.files && project.files.length > 0 && project.files[0].data) {
          var folder = await this.buscarPorID(project.files, data.id);

          if (folder) {
            if (folder.metadata && folder.metadata.comments) {
              send(folder.metadata.comments)
            } else {
              send([])
            }
          } else {
            send([])
          }
        } else {
          send([])
        }
      } else {
        send([])
      }
    })
  }
  this.addCommentsFile = async function (req, mongo, send) {
    var data = req.body
    mongo.findId('project', mongo.toId(data.project), { files: 1 }, async (err, project) => {
      if (!err && project) {
        if (project.files && project.files.length > 0 && project.files[0].data) {
          var folder = await this.buscarPorID(project.files, data.id);

          if (folder) {
            let comment = {
              id: mongo.newId(),
              text: data.value,
              user_id: req.session.context.user,
              date: new Date()
            }
            if (folder.metadata) {
              if (folder.metadata.comments) {
                folder.metadata.comments.push(comment)
              } else {
                folder.metadata.comments = [comment]
              }
            } else {
              folder.metadata = {
                comments: [comment]
              }
            }
            mongo.save('project', project, (err) => {
              if (!err) {
                send({
                  invalid: false,
                  error: "",
                  id: comment.id
                })
              } else {
                send({
                  invalid: true,
                  err: "Error"
                })
              }
            })
          } else {
            send([])
          }
        } else {
          send([])
        }
      } else {
        send([])
      }
    })
  }
  this.updateCommentsFile = async function (req, mongo, send) {
    var data = req.query
    mongo.findId('project', mongo.toId(data.project), { files: 1 }, async (err, project) => {
      if (!err && project) {
        if (project.files && project.files.length > 0 && project.files[0].data) {
          function findComment(arr, id) {
            for (var i = 0; i < arr.length; i++) {
              if (arr[i].metadata && arr[i].metadata.comments) {
                for (let y of arr[i].metadata.comments) {
                  if (y.id.toString() === id.toString()) {
                    return arr[i]; // Se encontró el ID en el nivel actual
                  }
                }
              }

              if (arr[i].data && arr[i].data.length > 0) {
                var resultado = findComment(arr[i].data, id);
                if (resultado) {
                  return resultado; // Se encontró el ID en el nivel subyacente
                }
              }
            }
            return null
          }
          var folder = findComment(project.files, data.id);

          if (folder) {
            for (let c in folder.metadata.comments) {
              let comm = folder.metadata.comments[c]
              if (comm.id.toString() === data.id.toString()) {
                comm.text = data.value
                break;
              }

            }
            mongo.save('project', project, (err) => {
              if (!err) {
                send({
                  invalid: false,
                  err: "",
                  id: data.id
                })
              } else {
                send({
                  invalid: true,
                  err: "Error"
                })
              }
            })
          } else {
            send([])
          }
        } else {
          send([])
        }
      } else {
        send([])
      }
    })
  }
  this.deleteCommentsFile = async function (req, mongo, send) {
    var data = req.query
    mongo.findId('project', mongo.toId(data.project), { files: 1 }, async (err, project) => {
      if (!err && project) {
        if (project.files && project.files.length > 0 && project.files[0].data) {
          function findComment(arr, id) {
            for (var i = 0; i < arr.length; i++) {
              if (arr[i].metadata && arr[i].metadata.comments) {
                for (let y of arr[i].metadata.comments) {
                  if (y.id.toString() === id.toString()) {
                    return arr[i]; // Se encontró el ID en el nivel actual
                  }
                }
              }

              if (arr[i].data && arr[i].data.length > 0) {
                var resultado = findComment(arr[i].data, id);
                if (resultado) {
                  return resultado; // Se encontró el ID en el nivel subyacente
                }
              }
            }
            return null
          }
          var folder = findComment(project.files, data.id);

          if (folder) {
            for (let c in folder.metadata.comments) {
              let comm = folder.metadata.comments[c]
              if (comm.id.toString() === data.id.toString()) {
                folder.metadata.comments.splice(c, 1)
                break;
              }

            }
            mongo.save('project', project, (err) => {
              if (!err) {
                send({
                  invalid: false,
                  err: "",
                  id: data.id
                })
              } else {
                send({
                  invalid: true,
                  err: "Error"
                })
              }
            })
          } else {
            send([])
          }
        } else {
          send([])
        }
      } else {
        send([])
      }
    })
  }
  this.directLink = function (req, mongo, send) {
    send({})
    /*let data = req.query
    mongo.findId('project', mongo.toId(data.project), { files: 1 }, async (err, project) => {
      if (!err && project) {
        if (project.files && project.files.length > 0 && project.files[0].data) {
          var folder = await this.buscarPorID(project.files, data.id);

          if (folder) {
            folder.recent = new Date()
            mongo.save('project', project, (err) => {
              if (!err) {
                send({})
              } else {
                send({})
              }
            })
          } else {
            send({})
          }
        } else {
          send({})
        }
      } else {
        send({})
      }
    })*/
  }
  this.buscarPorID = async function (arr, id) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id.toString() === id.toString() || arr[i].value.toString() === id.toString()) {
        return arr[i]; // Se encontró el ID en el nivel actual
      }

      if (arr[i].data && arr[i].data.length > 0) {
        var resultado = await this.buscarPorID(arr[i].data, id);
        if (resultado) {
          return resultado; // Se encontró el ID en el nivel subyacente
        }
      }
    }

    return null; // No se encontró el ID en el arreglo
  }
  this.saveFileManager = function (req, mongo, send) {
    var data = []
    var id = req.body._id
    var ids = []
    mongo.findId('project', mongo.toId(id), { files: 1 }, async (err, project) => {
      if (!err && project) {
        if (project.files && project.files.length) {
          data = project.files
          function source1(data) {
            for (const i in data) {
              const x = data[i]
              if (x.data) { source1(x.data) } else if (typeof x.id !== 'string' && x.reference) {
                ids.push(mongo.toId(x.reference.split('=')[1].split('&')[0]))
              }
            }
          }
          function source2(data, files, toSave) {
            for (const i in data) {
              const x = data[i]
              if (x.data) { source2(x.data, files, toSave) }
              if (typeof x.id !== 'string' && x.reference) {
                const doc = files[x.reference.split('=')[1].split('&')[0]]
                doc.newId = mongo.newId()
                toSave.push(doc)
                x.temp = x.id
                x.date = new Date()
                x.id = x.reference.split('=')[0] + '=' + doc.newId.toString() + '&' + x.reference.split('&')[1]
                x.reference = x.id
              }
            }
          }
          if (data.length > 0) {
            source1(data)
            mongo.toHash('fs.files', { _id: { $in: ids } }, {}, (err, files) => {
              if (!err) {
                var toSave = []
                source2(data, files, toSave)
                if (toSave.length > 0) {
                  save(toSave, 0)
                } else {
                  mongo.save('project', { _id: id, files: data }, (err) => {
                    if (!err) {
                      send({ data: data })
                    } else {
                      send(err)
                    }
                  })
                }
              }
            })
          } else {
            send({})
          }
          function save(toSave, i) {
            mongo.copyfile(toSave[i]._id, toSave[i].newId, (err) => {
              if (!err) {
                if (i < toSave.length - 1) {
                  i = i + 1
                  save(toSave, i)
                } else {
                  mongo.save('project', { _id: id, files: data }, (err) => {
                    if (!err) {
                      send({ data: data })
                    } else {
                      send(err)
                    }
                  })
                }
              } else {
                send(err)
              }
            })
          }
        } else {
          send({})
        }
      } else {
        send({})
      }
    })
  }
  this.proceedings = function (req, mongo, send) {
    mongo.findId('project', req.query._id, async (err, doc) => {
      if (!err && doc) {
        let unit = await new Promise(resolve => {
          mongo.findId('unit', doc.unit, { name: 1 }, (err, unit) => {
            if (unit) resolve(unit.name)
            else resolve('')
          })
        })
        let units = ''
        if (doc.units && doc.units.length) {
          await new Promise(resolve => {
            mongo.find('unit', { _id: { $in: doc.units } }, { name: 1 }, (err, uns) => {
              if (uns) {
                for (let i in uns) {
                  if (i === '0') units += uns[i].name
                  else units += ', ' + uns[i].name
                }
                resolve()
              }
              else resolve()
            })
          })
        } else if (doc.units) {
          await new Promise(resolve => {
            mongo.findId('unit', doc.units, { name: 1 }, (err, unit) => {
              if (unit) {
                units = unit.name
                resolve()
              }
              else resolve()
            })
          })
        }
        let processes = ''
        if (doc.processes && doc.processes.length) {
          await new Promise(resolve => {
            mongo.find('process', { _id: { $in: doc.processes } }, { name: 1 }, (err, pros) => {
              if (pros) {
                for (let i in pros) {
                  if (i === '0') processes += pros[i].name
                  else processes += ', ' + pros[i].name
                }
                resolve()
              }
              else resolve()
            })
          })
        }
        let nameTags = ''
        if (doc.tag) {
          if (!mongo.isNativeId(doc.tag) && doc.tag.length >= 24) {
            let tag = doc.tag.split(',')
            for (let t in tag) {
              tag[t] = mongo.toId(tag[t])
            }
          } else if (doc.tag.length === 24) {
            doc.tag = [doc.tag]
          }
          await new Promise(resolve => {
            mongo.findOne('params', { 'options.id': { $in: doc.tag } }, {}, (err, tags) => {
              if (tags) {
                for (let u in doc.tag) {
                  for (let o in tags.options) {
                    if (doc.tag[u].toString() === tags.options[o].id.toString()) {
                      if (u === '0') nameTags += tags.options[o].value
                      else nameTags += ', ' + tags.options[o].value
                    }
                  }
                }
                resolve()
              }
              else resolve()
            })
          })
        }
        let area = ''
        if (doc.area) {
          area = await new Promise(resolve => {
            mongo.findOne('params', { 'options.id': { $in: [doc.area] } }, {}, (err, areaT) => {
              if (areaT) {
                let area = ''
                for (let o in areaT.options) {
                  if (doc.area.toString() === areaT.options[o].id.toString()) {
                    area = areaT.options[o].value
                  }
                }
                resolve(area)
              }
              else resolve('')
            })
          })
        }
        let riesgo = ''
        if (doc.risk) {
          riesgo = await new Promise(resolve => {
            mongo.findOne('params', { 'options.id': { $in: [doc.risk] } }, {}, (err, riskT) => {
              if (riskT) {
                let riesgo = ''
                for (let o in riskT.options) {
                  if (doc.risk.toString() === riskT.options[o].id.toString()) {
                    riesgo = riskT.options[o].value
                  }
                }
                resolve(riesgo)
              }
              else resolve('')
            })
          })
        }
        let manager = ''
        let members = ''
        let guests = ''
        if (doc.actors) {
          let manager_members = doc.actors.filter((x) => {
            return x.type[0] !== 'guest'
          })
          let guestsArray = doc.actors.filter((x) => {
            return x.type[0] === 'guest'
          })
          for (let i in manager_members) {
            if (i === '0') {
              await new Promise(resolve => {
                mongo.findId('user', manager_members[i].user, { name: 1 }, (err, user) => {
                  if (user) {
                    manager = user.name
                    resolve()
                  }
                  else resolve()
                })
              })
            } else {
              await new Promise(resolve => {
                mongo.findId('user', manager_members[i].user, { name: 1 }, (err, user) => {
                  if (user) {
                    if (i === '1') members += user.name
                    else members += ', ' + user.name
                    resolve()
                  }
                  else resolve()
                })
              })
            }
          }
          for (let i in guestsArray) {
            await new Promise(resolve => {
              mongo.findId('user', guestsArray[i].user, { name: 1 }, (err, user) => {
                if (user) {
                  if (i === '0') guests += user.name
                  else guests += ', ' + user.name
                  resolve()
                }
                else resolve()
              })
            })
          }
        }
        var tasks = await new Promise((resolve) => {
          mongo.find('task', { project: mongo.toId(doc._id) }, (err, tasks) => {
            if (err) { resolve([]) } else { resolve(tasks) }
          })
        })
        let htmlTasks = ''
        var parents = []
        var level = [0]
        let duration = 0
        let realDuration = 0
        await new Promise(resolve => {
          mongo.find('time', { project: doc._id }, {}, {}, (err, times) => {
            if (times) {
              for (const t in times) {
                if (times[t].user && times[t].duration && times[t].project && times[t].project.toString() === doc._id.toString()) {
                  realDuration += parseFloat(times[t].duration)
                }
              }
              resolve()
            } else resolve()
          })
        })
        var datesStart = []
        var datesEnd = []
        for (let t in tasks) {
          if (tasks[t].type === 'task') {
            duration = duration + parseFloat(tasks[t].duration)
            datesStart.push(new Date(tasks[t].start_date).getTime())
            datesEnd.push(new Date(tasks[t].end_date).getTime())
          }
          let space = '>'
          const p = parents.indexOf(tasks[t].parent.toString())
          if (p === -1) {
            parents = []
            level = [level[0] + 1]
          } else {
            space = ' style="margin-left:' + ((p + 1) * 10) + 'px">'
            parents.splice(p + 1, 100)
            level.splice(p + 1, 100)
            if (level[p + 1]) {
              level[p + 1]++
            } else {
              level.push(1)
            }
          }
          for (const x in level) {
            space += (level.length > 1 ? '' : level[x] + '.')
          }
          space += '&nbsp;'
          parents.push(tasks[t].id.toString())
          htmlTasks += '<div style="font-size:11px !important;"' + space + tasks[t].text + '<br>'
          htmlTasks += '&nbsp; ' + tasks[t].description + '</div><br>'
          let documents = await new Promise(resolve => {
            mongo.find('document', { task: mongo.toId(tasks[t].id) }, { name: 1, tags: 1, content: 1, contentImg: 1 }, (err, documents) => {
              if (documents) {
                resolve(documents)
              } else resolve(false)
            })
          })
          let notes = await new Promise(resolve => {
            mongo.find('note', { task: mongo.toId(tasks[t].id) }, { name: 1, tags: 1, content: 1, contentImg: 1 }, (err, notes) => {
              if (notes) {
                resolve(notes)
              } else resolve(false)
            })
          })
          documents = documents.concat(notes)
          if (documents && documents.length) {
            htmlTasks += '<div style="font-weight:bold;">Documentos</div>'
            for (let d in documents) {
              let docu = documents[d]
              let docuTags = ''
              await new Promise(resolve => {
                mongo.findOne('params', { 'options.id': { $in: docu.tags || [] } }, {}, (err, tags) => {
                  if (tags) {
                    for (let u in docu.tags) {
                      for (let o in tags.options) {
                        if (docu.tags[u].toString() === tags.options[o].id.toString()) {
                          if (u === '0') docuTags += tags.options[o].value
                          else docuTags += ', ' + tags.options[o].value
                        }
                      }
                    }
                  }
                  htmlTasks += '<div>* ' + docuTags + ' ' + docu.name + '</div><br>'
                  if (docu.contentImg) {
                    htmlTasks += '<div style=\'width: 100%;height:auto;\'><img style=\' width:100%;height:auto;\' src=\'' + docu.contentImg + '\' /></div><br>'
                  } else {
                    htmlTasks += '<div>' + docu.content + '</div><br>'
                  }
                  resolve()
                })
              })
            }
          }
        }
        var min = Math.min.apply(null, datesStart)
        var max = Math.max.apply(null, datesEnd)
        let inicio = ''
        let fin = ''
        try {
          if (min && max) {
            inicio = dateformat(new Date(min), 'yyyy/mm/dd')
            fin = dateformat(new Date(max), 'yyyy/mm/dd')
          }
        } catch (err) {
          inicio = dateformat(new Date(), 'yyyy/mm/dd')
          fin = dateformat(new Date(), 'yyyy/mm/dd')
        }
        duration = duration ? (duration / 60).toFixed(2) : duration
        realDuration = realDuration ? (realDuration / 60).toFixed(2) : realDuration
        var notes = await new Promise((resolve) => {
          mongo.find('note', { project: mongo.toId(doc._id) }, (err, notes) => {
            if (err) { resolve([]) } else { resolve(notes) }
          })
        })
        let htmlAtts = ''
        if (notes && notes.length) {
          for (let n in notes) {
            await new Promise(resolve => {
              mongo.find('attached', { reference: notes[n]._id }, { name: 1, content: 1 }, (err, atts) => {
                if (atts) {
                  if (n === '0') htmlAtts += '<div style="font-weight:bold;">Anexos</div>'
                  for (let a in atts) {
                    let num = Number(a) + 1
                    htmlAtts += '<div style="font-weight:bold;">Documento ' + num + ' ' + atts[a].name + '</div><br>'
                    htmlAtts += '<div>' + atts[a].content + '</div><br>'
                  }
                  resolve()
                } else resolve()
              })
            })
          }
        }
        let tipo = doc.type || ''
        doc.description = doc.description.replace(/font-size:/gi, '')
        htmlTasks = htmlTasks.replace(/font-size:/gi, '')
        htmlTasks = htmlTasks.replace(/<table/gi, "<div><table style='font-size: 9px !important;'")
        htmlTasks = htmlTasks.replace(/<\/table/gi, '</table></div')
        htmlAtts = htmlAtts.replace(/font-size:/gi, '')
        htmlAtts = htmlAtts.replace(/<table/gi, "<div><table style='font-size: 9px !important;'")
        htmlAtts = htmlAtts.replace(/<\/table/gi, '</table></div')
        var content = '<div>'
        content += '<div style="font-weight:bold;">Nombre del estudio</div>' + doc.name + '<p>'
        content += '<div style="font-weight:bold;">Tipo</div>' + tipo + '<p>'
        content += '<div style="font-weight:bold;">Unidad ejecutora</div>' + unit + '<p>'
        content += '<div style="font-weight:bold;">Unidad analizada</div>' + units + '<p>'
        content += '<div style="font-weight:bold;">Procesos</div>' + processes + '<p>'
        content += '<div style="font-weight:bold;">Categoría</div>' + nameTags + '<p>'
        content += '<div style="font-weight:bold;">Área</div>' + area + '<p>'
        content += '<div style="font-weight:bold;">Nivel de riesgo</div>' + riesgo + '<p>'
        content += '<div style="font-weight:bold;">Duración estimada</div>' + duration + '<p>'
        content += '<div style="font-weight:bold;">Duración real</div>' + realDuration + '<p>'
        content += '<div style="font-weight:bold;">Fecha inicio</div>' + inicio + '<p>'
        content += '<div style="font-weight:bold;">Fecha fin</div>' + fin + '<p>'
        content += '<div style="font-weight:bold;">Personal asignado</div>'
        content += '<div style="font-weight:bold;">-Gerente</div>' + manager + '<br>'
        content += '<div style="font-weight:bold;">-Miembros</div>' + members + '<br>'
        content += '<div style="font-weight:bold;">-Invitados</div>' + guests + '<p>'
        content += '<div style="font-weight:bold;">Descripcion</div><div style="18px;">' + doc.description + '</div<p>'
        content += '<div style="font-weight:bold;">Guia de trabajo</div><p>'
        content += htmlTasks
        content += '<p>'
        content += htmlAtts
        content += '</div>'
        // TODO workpapers here
        html.pdf(mongo, req, content, doc.pageType, (err, stream) => {
          if (err) {
            send({ error: err })
          } else {
            send(stream)
          }
        })
      } else {
        send({ error: err })
      }
    })
  }
  this.index = function (req, mongo, send) {
    mongo.findId('project', req.query._id, async (err, doc) => {
      if (!err && doc) {
        var content = ''
        // TODO project header
        content += doc.description
        content += '<p style="page-break-after: always;">&nbsp;</p>'
        var tasks = await new Promise(resolve => {
          mongo.aggregate('task', [
            { $match: { project: doc._id } },
            {
              $lookup: {
                from: 'document',
                let: { task: '$_id', docs: '$documents' },
                pipeline: [
                  { $match: { $expr: { $or: [{ $eq: ['$$task', '$task'] }, { $in: ['$_id', '$$docs'] }] } } },
                  { $project: { name: 1 } },
                  { $sort: { Name: 1 } }
                ],
                as: 'documents'
              }
            },
            { $project: { orden: 1, text: 1, type: 1, documents: 1, parent: 1 } },
            { $sort: { orden: 1 } }
          ], {}, (err, tasks) => {
            if (err) {
              resolve(err)
            } else {
              resolve(tasks)
            }
          })
        })
        content += tasks2table(tasks)
        content += '</div>'
        // TODO workpapers here
        html.pdf(mongo, req, content, doc.pageType, (err, stream) => {
          if (err) {
            send({ error: err })
          } else {
            send(stream)
          }
        })
      } else {
        send({ error: err })
      }
    })
    function tasks2table(tasks) {
      var html = '<style>.cl {width: 100%;background-color:#eee;} .cl td {padding:5px;background-color:#fff;} .cl tr#milestone td{background-color:#eee;}</style>'
      html += '<div style="text-align:center;font-weight:bold;">Plan de trabajo</div>'
      html += '<table class="cl"><tr><th>Tareas y evidencias</th></tr>'
      var parents = []
      for (const i in tasks) {
        var task = tasks[i]
        let space = '>'
        const p = parents.indexOf(task.parent.toString())
        if (p === -1) {
          parents = []
        } else {
          space = ' style="margin-left:' + ((p + 1) * 10) + 'px">'
          parents.splice(p + 1, 100)
        }
        parents.push(task._id.toString())
        var margen = ' style="margin-left:' + ((p + 2) * 10) + 'px">'
        html += '<tr id="' + task.type + '"><td><div' + space + task.text + '</div></td></tr>'
        for (let j in task.documents) {
          html += '<tr><td><div' + margen + ' ' + (Number(j) + 1) + ' - ' + task.documents[j].name + '</div></td></tr>'
        }
      }
      html += '</table>'
      return html
    }
  }
  //
  this.pdf = function (req, mongo, send) {
    mongo.findId('project', req.query._id, async (err, doc) => {
      if (!err && doc) {
        var content = ''
        // TODO project header
        content += doc.description
        content += '<p style="page-break-after: always;">&nbsp;</p>'
        var users = await new Promise(resolve => {
          const ids = []
          doc.actors.forEach((it) => { ids.push(it.user) })
          mongo.toHash('user', { _id: { $in: ids } }, (err, docs) => {
            if (!err && docs) {
              resolve(docs)
            } else {
              resolve({})
            }
          })
        })
        content += gantt2table(doc.content.data, doc.content.links, users)
        content += '</div>'
        // TODO workpapers here
        html.pdf(mongo, req, content, doc.pageType, (err, stream) => {
          if (err) {
            send({ error: err })
          } else {
            send(stream)
          }
        })
      } else {
        send({ error: err })
      }
    })
    function gantt2table(tasks, links, users) {
      var html = '<style>.cl {width: 100%;background-color:#eee;} .cl td {padding:5px;background-color:#fff;} .cl tr#milestone td{background-color:#eee;}</style>'
      html += '<div style="text-align:center;font-weight:bold;">Plan de trabajo</div>'
      html += '<table class="cl"><tr><th>Tarea</th><th>Encargado</th><th>Duración</th><th>De</th><th>A</th></tr>'
      var parents = []
      var level = [0]
      for (const i in tasks) {
        var task = tasks[i]
        let user = ['task', 'milestone'].includes(task.type) ? task.owner_id : ''
        let space = '>'
        const p = parents.indexOf(task.parent.toString())
        if (p === -1) {
          parents = []
          level = [level[0] + 1]
        } else {
          space = ' style="margin-left:' + ((p + 1) * 10) + 'px">'
          parents.splice(p + 1, 100)
          level.splice(p + 1, 100)
          if (level[p + 1]) {
            level[p + 1]++
          } else {
            level.push(1)
          }
        }
        for (const x in level) {
          space += level[x] + '.'
        }
        space += '&nbsp;'
        parents.push(task.id.toString())
        user = user ? users[user.toString()] ? users[user.toString()].name : '' : ''
        html += '<tr id="' + task.type + '"><td><div' + space + task.text + '</div></td><td>' + user + '</td><td align="right">' +
          task.duration + '</td><td>' + task.start_date + '</td><td>' + task.end_date + '</td></tr>'
      }
      html += '</table>'
      return html
    }
  }

  this.commentsOfTasks = function (req, mongo, send) {
    let id = req.query._id
    let keys = { project: mongo.toId(id), documentType: 'task' }
    if (req.query.task && req.query.task.length === 24) {
      keys.document = mongo.toId(req.query.task)
    }
    if (req.query.user && req.query.user.length === 24) {
      keys.user = mongo.toId(req.query.user)
    }
    if (req.query.period) {
      if (req.query.period.start && req.query.period.end) {
        keys.dateTime = { $gte: req.query.period.start, $lte: new Date(new Date(req.query.period.end).setHours(23, 59, 59)) }
      } else if (req.query.period.start && !req.query.period.end) {
        keys.dateTime = { $gte: req.query.period.start, $lte: new Date(new Date(req.query.period.start).setHours(23, 59, 59)) }
      }
    }
    if (req.query.recent) {
      let fecha = new Date()
      keys.dateTime = { $gte: new Date(fecha.setDate(fecha.getDate() - 2)) }
    }
    var now = new Date()
    var pipeline = [
      { $match: keys },
      { $lookup: { from: 'user', localField: 'user', foreignField: '_id', as: 'user' } },
      { $lookup: { from: 'task', localField: 'document', foreignField: '_id', as: 'task' } },
      {
        $project: {
          id: '$_id', document: 1, details: { $concat: [{ $ifNull: [{ $arrayElemAt: ['$user.name', 0] }, ''] }, ' - ', { $ifNull: [{ $arrayElemAt: ['$task.text', 0] }, ''] }] },
          description: '$comment', date: { $dateToString: { format: '%d-%m-%Y a las %H:%M:%S', date: '$dateTime', timezone: '-06:00' } },
          recent: { $dateDiff: { startDate: '$dateTime', endDate: now, unit: 'hour' } }, _id: 0
        }
      },
      { $addFields: { recent: { $cond: { if: { $lt: ['$recent', 24] }, then: true, else: false } } } },
      { $sort: { id: -1 } }
    ]
    mongo.aggregate('comment', pipeline, {}, async (err, docs) => {
      if (err) {
        console.log(err)
        send()
      } else {
        send(docs)
      }
    })
  }

  this.timeline = function (req, mongo, send) {
    let id = req.query._id
    let keys = { project: mongo.toId(id) }
    if (req.query.status && !Number(req.query.status)) {
      keys.data = req.query.status
    }
    if (req.query.user && req.query.user.length === 24) {
      keys.user = mongo.toId(req.query.user)
    }
    if (req.query.task && req.query.task.length === 24) {
      keys.docId = mongo.toId(req.query.task)
    }
    if (req.query.period) {
      if (req.query.period.start && req.query.period.end) {
        keys.date = { $gte: req.query.period.start, $lte: new Date(new Date(req.query.period.end).setHours(23, 59, 59)) }
      } else if (req.query.period.start && !req.query.period.end) {
        keys.date = { $gte: req.query.period.start, $lte: new Date(new Date(req.query.period.start).setHours(23, 59, 59)) }
      }
    }
    var pipeline = [
      { $match: keys },
      { $lookup: { from: 'user', localField: 'user', foreignField: '_id', as: 'user' } },
      { $lookup: { from: 'task', localField: 'docId', foreignField: '_id', as: 'task' } },
      { $project: { id: '$_id', event: 1, value: '$data', user: { $ifNull: [{ $arrayElemAt: ['$user.name', 0] }, ''] }, task: { $ifNull: [{ $arrayElemAt: ['$task.text', 0] }, ''] }, description: 1, date: { $dateToString: { format: '%d-%m-%Y a las %H:%M:%S', date: '$date', timezone: '-06:00' } }, date2: '$date', _id: 0 } },
      { $sort: { date2: -1 } }
    ]
    mongo.aggregate('eventTask', pipeline, {}, async (err, docs) => {
      if (err) {
        console.log(err)
        send()
      } else {
        send(docs)
      }
    })
  }
}
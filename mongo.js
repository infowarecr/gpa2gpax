/* global Buffer */
/**
 * Created by jorge on 28/04/17.
 */
var { MongoClient, ObjectId, Binary, Timestamp, GridFSBucket, AnyBulkWriteOperation } = require('mongodb')

var maxWait = 20000

class Mongo {
  constructor(url) {
    this.url = url
    this.dbname = this.url
    this.dbname = this.dbname.substring(this.dbname.lastIndexOf('/') + 1)
    if (this.dbname.includes('?')) {
      this.dbname = this.dbname.substring(0, this.dbname.indexOf('?'))
    }
    this.client = new MongoClient(url, { connectTimeoutMS: 12000, socketTimeoutMS: 30000, waitQueueTimeoutMS: 30000, appname: 'gpax' })
  }
  timestamp(a, b) {
    return Timestamp.fromBits(a, b)
  }
  newId(date) {
    var _id = new ObjectId()
    if (date) {
      var timestamp = Math.floor(date.getTime() / 1000)
      var hex = timestamp.toString(16) + '0000000000000000'
      _id = new ObjectId(hex)
    }
    return _id
  }

  binary(buffer, subtype) {
    return new Binary(buffer, subtype)
  }
  db() {
    return this.client.db()
  }
  getCollections(next) {
    var db = this.db()
    db.listCollections().toArray().then(next)
  }

  toId(base) {
    return this.isNativeId(base) ? new ObjectId(base) : Number(base) || base
  }

  isNativeId(id) {
    var r = false
    if (id && ('' + id).toString().match(/^[0-9a-fA-F]{24}$/)) {
      r = true
    }
    return r
  }

  disconnect() {
    if (this.client) {
      this.client.close()
      this.client = null
    }
  }
  copyTo(collection, collectionTarget, next) {
    var db = this.db()
    db.collection(collection).aggregate([{ $out: collectionTarget }]).then(r => next(null, r)).catch(err => next(err))
  }
  aggregation = function (collection, next) {
    var db = this.db()

    next(db.collection(collection).aggregate([], {}))
  }
  aggregate(collection, pipeline, options, next) {
    if (!next) {
      next = options
      options = { allowDiskUse: true }
    }
    var db = this.db()
    var cursor
    cursor = db.collection(collection).aggregate(pipeline, options)
    cursor.maxTimeMS(maxWait)
    cursor.toArray().then(r => next(null, r)).catch(err => next(err))
  }
  aggregate2cursor(collection, pipeline, options, next) {
    var db = this.db()
    var cursor
    cursor = db.collection(collection).aggregate(pipeline, options)
    cursor.maxTimeMS(maxWait)
    next(null, cursor)
  }
  docs(collection, fields, sort, next) {
    if (arguments.length === 3 && sort instanceof Function) {
      next = sort
      sort = undefined
    } else if (arguments.length === 2 && fields instanceof Function) {
      next = fields
      fields = {}
    }
    var db = this.db()
    var cursor
    if (sort && Object.keys(sort).length > 0) {
      cursor = db.collection(collection).find({}, { projection: fields, sort: sort })
    } else {
      cursor = db.collection(collection).find({}, { projection: fields })
    }
    if (cursor) {
      cursor.maxTimeMS(maxWait)
      cursor.toArray().then(r => next(null, r)).catch(err => next(err))
    } else {
      next('not found', [])
    }
  }

  toHash(collection, keys, fields, sort, next) {
    if (arguments.length === 4 && sort instanceof Function) {
      next = sort
      sort = undefined
    } else if (arguments.length === 3 && fields instanceof Function) {
      next = fields
      fields = {}
    }
    var db = this.db()
    var cursor
    if (sort && Object.keys(sort).length > 0) {
      cursor = db.collection(collection).find(keys, { projection: fields, sort: sort })
    } else {
      cursor = db.collection(collection).find(keys, { projection: fields })
    }
    if (cursor) {
      cursor.maxTimeMS(maxWait)
      cursor.toArray().then(array => {
        var hash = {}
        for (let i = 0; i < array.length; ++i) {
          var doc = array[i]
          if (doc._id) { hash[doc._id.toString()] = doc }
        }
        next(null, hash)
      }).catch(err => next(err))
    } else {
      next('not found', [])
    }
  }

  distinct(collection, field, keys, next) {
    var db = this.db()
    db.collection(collection).distinct(field, keys).then(r => next(null, r)).catch(err => next(err))
  }

  find(collection, keys, fields, sort, next) {
    if (arguments.length === 4 && sort instanceof Function) {
      next = sort
      sort = undefined
    } else if (arguments.length === 3 && fields instanceof Function) {
      next = fields
      fields = {}
    }
    var db = this.db()
    var cursor
    if (sort && Object.keys(sort).length > 0) {
      cursor = db.collection(collection).find(keys, { projection: fields, sort: sort })
    } else {
      cursor = db.collection(collection).find(keys, { projection: fields })
    }
    if (cursor) {
      cursor.maxTimeMS(maxWait)
      cursor.toArray().then(r => next(null, r)).catch(err => next(err))
    } else {
      next('not found', [])
    }
  }
  findOne(collection, keys, fields, next) {
    if (arguments.length === 3 && fields instanceof Function) {
      next = fields
      fields = null
    }
    var db = this.db()
    if (fields) {
      db.collection(collection).findOne(keys, { projection: fields }).then(r => next(null, r)).catch(err => next(err))
    } else {
      db.collection(collection).findOne(keys).then(r => next(null, r)).catch(err => next(err))
    }
  }

  findN(collection, skip, limit, keys, fields, sort, next) {
    if (arguments.length === 6 && sort instanceof Function) {
      next = sort
      sort = undefined
    } else if (arguments.length === 5 && fields instanceof Function) {
      next = fields
      fields = null
    }
    var db = this.db()
    var cursor = db.collection(collection).find(keys)
    cursor.maxTimeMS(maxWait)
    if (fields && Object.keys(fields).length > 0) cursor.project(fields)
    if (skip) cursor.skip(skip)
    if (limit) cursor.limit(limit)
    if (sort && Object.keys(sort).length > 0) cursor.sort(sort)
    cursor.toArray().then(r => next(null, r)).catch(err => next(err))
  }
  findOneAndUpdate(collection, keys, update, fields, next) {
    var db = this.db()
    if (!next) {
      next = fields
      db.collection(collection).findOneAndUpdate(keys, update).then(r => next(null, r)).catch(err => next(err))
    } else {
      db.collection(collection).findOneAndUpdate(keys, update, { projection: fields }).then(r => next(null, r)).catch(err => next(err))
    }
  }

  cursor(collection, keys, fields, sort, next) {
    if (arguments.length === 4 && sort instanceof Function) {
      next = sort
      sort = undefined
    } else if (arguments.length === 3 && fields instanceof Function) {
      next = fields
      fields = {}
    }
    var db = this.db()
    var cursor
    if (sort && Object.keys(sort).length > 0) {
      cursor = db.collection(collection).find(keys, { projection: fields, sort: sort })
      cursor.maxTimeMS(maxWait)
      next(null, cursor)
    } else {
      cursor = db.collection(collection).find(keys, { projection: fields })
      cursor.maxTimeMS(maxWait)
      next(null, cursor)
    }
  }
  createIndexes(collection, indexes, next) {
    var db = this.db()
    db.collection(collection).dropIndexes({}).then(r =>
      db.collection(collection).createIndexes(indexes, {}).then(r => next(null, r)).catch(err => next(err))
    ).then(r => next(null, r)).catch(err => next(err))
  }

  findId(collection, id, fields, sort, next) {
    if (arguments.length === 4 && sort instanceof Function) {
      next = sort
      sort = undefined
    }
    if (arguments.length === 3 && fields instanceof Function) {
      next = fields
      fields = undefined
    }
    var oid = ''
    if (id) {
      oid = this.isNativeId(id) ? new ObjectId(id) : id
    }
    var db = this.db()
    if (sort && Object.keys(sort).length > 0) {
      db.collection(collection).findOne({ _id: oid }, { projection: fields, sort: sort }).then(r => next(null, r)).catch(err => next(err))
    } else {
      db.collection(collection).findOne({ _id: oid }, { projection: fields }).then(r => next(null, r)).catch(err => next(err))
    }
  }

  str2id(value) {
    var r = value
    if (typeof value === 'string' && value.match(/^[0-9a-fA-F]{24}$/)) {
      r = new ObjectId(value)
    }
    return r
  }

  switchIds(field) {
    var type = typeof (field)
    if (!this.queue) {
      this.queue = []
    }
    if (type === 'object') {
      if (this.queue.indexOf(field) === -1) {
        this.queue.push(field)
        for (const key in field) {
          if (field[key]) {
            if (!(Buffer.isBuffer(field) && field[key] instanceof Function)) {
              if (this.isNativeId(field[key])) {
                field[key] = this.str2id(field[key])
              } else {
                this.switchIds(field[key])
              }
            }
          }
        }
      }
    } else if (type === 'array') {
      for (let i = 0; i < field.length; ++i) {
        if (this.isNativeId(field[key])) {
          field[key] = this.str2id(field[key])
        } else {
          this.switchIds(field[key])
        }
      }
    }
  }
  $replace(field) {
    var type = typeof (field)
    if (!this.queue) {
      this.queue = []
    }
    if (type === 'object') {
      if (this.queue.indexOf(field) === -1) {
        this.queue.push(field)
        for (const key in field) {
          if (Buffer.isBuffer(field[key]) || field[key] instanceof Function) {
            delete field[key]
          } else if (key !== 'content') {
            if (key.indexOf('$') === 0 && field[key].toHexString) {
              delete field[key]
            } else if (key.indexOf('$') === 0) {
              delete field[key]
            } else if (field[key]) {
              this.$replace(field[key])
            }
          }
        }
      }
    } else if (!field.toHexString && type === 'array') {
      for (let i = 0; i < field.length; ++i) {
        this.$replace(field[i])
      }
    }
  }
  changeStream(collection, pipeline, options, next) {
    pipeline = pipeline || []
    options = options || {}
    options.fullDocument = 'updateLookup'
    var db = this.db()
    var changeStream = db.collection(collection).watch(pipeline, options)
    next(changeStream)
  }
  async save(collection, doc, next) {
    this.queue = []
    this.switchIds(doc)
    var db = this.db()
    this.queue = []
    this.$replace(doc)
    db.collection(collection).updateOne({ _id: doc._id }, { $set: doc }, { upsert: true }).then(r => next(null, r)).catch(err => next(err))
  }
  bulkWrite(collection, updates, options, next) {
    this.queue = []
    this.switchIds(updates)
    var db = this.db()
    db.collection(collection).bulk(updates, options).then(r => next(null, r)).catch(err => next(err))
  }
  saveWithFilter(collection, filter, set, options, next) {
    this.queue = []
    this.switchIds(set)
    var db = this.db()
    this.queue = []
    this.$replace(set)
    db.collection(collection).updateMany(filter, { $set: set }, options).then(r => next(null, r)).catch(err => next(err))
  }

  insertMany(collection, doc, next) {
    var db = this.db()
    db.collection(collection).insertMany(doc).then(r => next(null, r)).catch(err => next(err))
  }

  update(collection, filter, doc, next) {
    this.queue = []
    this.switchIds(doc)
    this.queue = []
    this.switchIds(filter)
    var db = this.db()
    db.collection(collection).updateOne(filter, doc, { upsert: false }).then(r => next(null, r)).catch(err => next(err))
  }

  updateAll(collection, filter, doc, next) {
    var db = this.db()
    db.collection(collection).updateMany(filter, doc, { upsert: false }).then(r => next(null, r)).catch(err => next(err))
  }

  deleteOne(collection, keys, next) {
    var db = this.db()
    if (next) {
      db.collection(collection).deleteOne(keys).then(r => next(null, r)).catch(err => next(err))
    } else {
      db.collection(collection).deleteOne(keys)
    }
  }

  deleteAll(collection, keys, next) {
    var db = this.db()
    db.collection(collection).deleteMany(keys).then(r => next(null, r)).catch(err => next(err))
  }

  count(collection, keys, next) {
    var db = this.db()
    db.collection(collection).countDocuments(keys).then(r => next(null, r)).catch(err => next(err))
  }
  estimatedCount(collection, keys, next) {
    var db = this.db()
    db.collection(collection).estimatedDocumentCount(keys).then(r => next(null, r)).catch(err => next(err))
  }

  // Security & util functions
  userUnits(user, roles, keys, next) {
    if (user && roles && keys) {
      this.find('unit', { $and: [{ actors: { $elemMatch: { user: user, type: { $in: roles } } } }, keys] }).then(r => next(null, { removed: true })).catch(err => next(err))
    } else if (user && roles) {
      this.find('unit', { actors: { $elemMatch: { user: user, type: { $in: roles } } } }).then(r => next(null, { removed: true })).catch(err => next(err))
    } else {
      next({ error: 'paramsFail' })
    }
  }

  sessionUnits(session, roles, keys, next) {
    if (roles && keys) {
      this.find('unit', { $and: [{ _id: { $in: session.units }, 'actors.type': { $in: roles } }, keys] }).then(r => next(null, { removed: true })).catch(err => next(err))
    } else if (roles) {
      this.find('unit', { _id: { $in: session.units }, 'actors.type': { $in: roles } }).then(r => next(null, { removed: true })).catch(err => next(err))
    } else {
      this.find('unit', { _id: { $in: session.units } }).then(r => next(null, { removed: true })).catch(err => next(err))
    }
  }

  userRoles(user, keys, next) {
    if (user && keys) {
      this.find('user', { $and: [{ _id: user }, keys] }).then(r => next(null, { removed: true })).catch(err => next(err))
    } else {
      next({ error: 'paramsFail' })
    }
  }
  async hasIndex(collection, index) {
    var db = this.db()
    return await db.collection(collection).indexExists(index)
  }
  changes(pipeline, options, next) {
    var db = this.db()
    next(db.watch(pipeline, options))
  }
  async bulk(collection, cursor, next) {
    var db = this.db()
    var target = db.collection(collection)
    var batch = target.initializeOrderedBulkOp()
    var counter = 0
    while (doc = await cursor.next()) {
      batch.insert(doc)
      counter++
      if (counter % 1000 === 0) {
        await batch.execute()
        batch = target.initializeOrderedBulkOp()
      }
    }
    if (counter % 1000 !== 0) {
      await batch.execute()
    }
    next(null, { inserts: counter })
  }
}
exports.Mongo = Mongo 

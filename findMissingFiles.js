

const to = 'mongodb://gpax2,gpax3/gpax?replicaSet=gpax'

const inicio = new Date()

var mongo = new (require('./mongo.js').Mongo)(to)

const fs = require('fs')

var lines = fs.readFileSync('plan8.txt').toString()
findFiles(lines.split(/\r?\n/))
var missing=fs.createWriteStream('missingFiles8.txt',{flags:'a'})
async function findFiles(names) {
  for (let i in names) {
    let name = names[i]
    await new Promise(resolve => {
      mongo.find('fs.files', { filename: name }, (err, file) => {
        if (err) console.log(err)
        else if (!file[0]) {
          missing.write(name+'\n')
        }
        resolve()
      })
    })
  }
}
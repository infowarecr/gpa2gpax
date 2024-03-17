
const from = {
  server: '172.26.1.148',
  port: 54302,
  user: 'infoware',
  password: 'Migracion$2024gpaxes',
  database: 'gpa',
  requestTimeout: 180000,
  options: {
    trustServerCertificate: true
  }
}
//const to = 'mongodb://gpax1/gpax'
const to = 'mongodb://gpax2,gpax3/gpax?replicaSet=gpax'
var mongo = new (require('./mongo.js').Mongo)(to)

const tareas = [19270, 19506, 19185, 19188, 19273, 19429, 19577, 19579, 19372, 19667, 19687, 19683, 19557, 19551, 19559, 19680, 19426, 19580, 19606, 19524, 19269, 19369, 19619, 19626, 19505, 19641, 19574, 19044, 19597, 19616, 19589, 19662, 19654, 19672, 19673, 19679, 19681, 19263, 19613, 19643, 19264, 19422, 18514, 19430, 19501, 19561, 18506, 18513, 19596, 19598, 19260, 19043, 19637, 19661, 19668, 19675, 19676, 19622, 19272, 19276, 19368, 19612, 19587, 19623, 19552, 19371, 19576, 19584, 19585, 19045, 19588, 19642, 19603, 19621, 19632, 19657, 19686, 19689, 19266, 19609, 19647, 18966, 19565, 19582, 19572, 19042, 19659, 19279, 19586, 18509, 19639, 19554, 19601, 19610, 19638, 19646, 19682, 19670, 19594, 19599, 19625, 19635, 19663, 19556, 19631, 19569, 19671, 19677, 19504, 19425, 19605, 19629, 19193, 19526, 19688, 19041, 19655, 19361, 19627, 19674, 18511, 19502, 19522, 19566, 19186, 19040, 19262, 19360, 19575, 18508, 19431, 19278, 19581, 19424, 19427, 19607, 19611, 19630, 19648, 19633, 19652, 19656, 19666, 19367, 19664, 19274, 19265, 19617, 19685, 19189, 19523, 19555, 19363, 19564, 19618, 19280, 19628, 19634, 19690, 19190, 19509, 19187, 19560, 19039, 19275, 19370, 19525, 19593, 19602, 19428, 19527, 19600, 18512, 19595, 19436, 19636, 19499, 19640, 19678, 19684, 19192, 19658, 19194, 19046, 19195, 19563, 18507, 19191, 19261, 19500, 19591, 19604, 19620, 19558, 19653, 19271, 19277, 19432, 19583, 19568, 19498, 19521, 19578, 19592, 19562, 19267, 19503, 18510, 19567, 19590, 19608, 19614, 19615, 19224, 19268, 19624, 19644, 19362, 19550, 19645, 19553, 19665, 19571] 

mongo.find('idMigration', {
  table: 'taskf', idSql: {    $in: tareas  }}, async (err, fases) => {
  for (let i in fases) {
    var f=fases[i]
    await new Promise(resolve => {
      mongo.findOne('task', { _id: f._id }, (err, fase) => {
        mongo.updateAll('task', { project: f.idSql },
          {
            $set: {
              project: fase.project,
              start_date: fase.start_date,
              parent: fase._id
            }
          }, (err, result) => {
            console.log(JSON.stringify(result))
            resolve()
          })
      })
    })
  }
  mongo.find('idMigration', { table: 'taska', idSql: { $in: tareas } }, async(err, actividades) => {
    for (let i in actividades) {
      var a=actividades[i]
      await new Promise(resolve => {
        mongo.findOne('task', { _id: a._id }, (err, actividad) => {
          mongo.updateAll('task', { project: a.idSql },
            {
              $set: {
                project: actividad.project,
                start_date: actividad.start_date,
                parent: actividad._id
              }
            }, (err, result) => {
              console.log(JSON.stringify(result))
              resolve()
            })
        })
      })
    }
  })
})
     
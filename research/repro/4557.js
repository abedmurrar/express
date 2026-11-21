// #4557 app.use('//', router) also matches requests that start with a single '/'
const { run, express } = require('./_req')
const app = express()
const admin = express.Router()
admin.get('/secret', (req, res) => res.send('ADMIN ROUTER'))
app.use('//', admin)
app.get('/secret', (req, res) => res.send('main app'))
run(app, 39212, { path: '/secret' }).then((r) => {
  console.log('GET /secret ->', r.status, r.body.toString())
  console.log('VERDICT:', r.body.toString() === 'ADMIN ROUTER' ? 'reproduced (router mounted at "//" answers "/secret")' : 'not reproduced')
})

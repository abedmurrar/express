// #4059 rewriting req.url inside a router mounted at '/app' loses the slash on the way out
const { run, express } = require('./_req')
const app = express()
let seen
const router = express.Router()
router.use((req, res, next) => { req.url = '/index.html'; next() })
app.use('/app', router)
app.use((req, res) => { seen = req.url; res.send(req.url) })
run(app, 39215, { path: '/app' }).then((r) => {
  console.log('req.url after router:', JSON.stringify(seen))
  console.log('VERDICT:', seen === '/appindex.html' ? 'reproduced ("/appindex.html", slash lost)' : 'not reproduced (' + seen + ')')
})

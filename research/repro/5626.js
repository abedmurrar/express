// #5626 OPTIONS handler that sets a header then sends JSON -> ERR_HTTP_HEADERS_SENT?
const { run, express } = require('./_req')
const app = express()
const router = express.Router()
router.options('/', (req, res) => { res.status(200).setHeader('Access-Control-Allow-Methods', 'GET'); res.json({ schema: 1 }) })
app.use(router)
let uncaught = null
process.on('uncaughtException', (e) => { uncaught = e.code })
run(app, 39228, { method: 'OPTIONS' }).then((r) => setTimeout(() => {
  console.log(r.status, r.headers['access-control-allow-methods'], r.body.toString(), '| uncaught:', uncaught)
  console.log('VERDICT:', uncaught ? 'reproduced' : 'not reproduced on master')
}, 100))

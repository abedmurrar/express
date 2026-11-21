// #7560 res.render() after the response was sent: ERR_HTTP_HEADERS_SENT escapes as an uncaught exception
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path')
const { run, express } = require('./_req')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r7560-'))
fs.writeFileSync(path.join(dir, 'index.tmpl'), 'hi')
let uncaught = null
process.on('uncaughtException', (e) => { uncaught = e.code || e.message })
const app = express()
app.engine('tmpl', (file, opts, cb) => cb(null, fs.readFileSync(file, 'utf8')))
app.set('views', dir); app.set('view engine', 'tmpl')
let handled = null
app.get('/', (req, res) => { res.send('already sent'); res.render('index') })
app.use((err, req, res, next) => { handled = err.code })
run(app, 39207).then((r) => setTimeout(() => {
  fs.rmSync(dir, { recursive: true })
  console.log('client got:', r.status, JSON.stringify(r.body.toString()), '| error handler saw:', handled, '| uncaught:', uncaught)
  console.log('VERDICT:', uncaught ? 'reproduced (uncaught ' + uncaught + ', would crash a process with no handler)' : 'not reproduced')
}, 200))

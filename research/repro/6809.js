// #6809 a router mounted on itself is accepted at startup and blows the stack per request
const { run, express } = require('./_req')
const app = express()
const r = express.Router()
r.use(r)
app.use(r)
app.use((err, req, res, next) => res.status(500).send(err.constructor.name + ': ' + err.message))
let warned = false
process.on('warning', () => { warned = true })
run(app, 39216).then((res) => {
  console.log('status', res.status || res.error, String(res.body || '').slice(0, 80), '| startup warning:', warned)
  console.log('VERDICT:', /Maximum call stack/.test(String(res.body)) || res.error ? 'reproduced (no warning at mount; RangeError per request)' : 'not reproduced')
})

// #4944 res.download / sendFile of a /proc pseudo-file returns an empty body (size 0 on stat)
const { run, express } = require('./_req')
const app = express()
app.get('/', (req, res) => res.sendFile('/proc/cpuinfo'))
run(app, 39225).then((r) => {
  if (r.error) { console.log('client error:', r.error); console.log('VERDICT: reproduced (response broken: ' + r.error + ')'); return }
  console.log('status', r.status, 'bytes', r.body.length, 'content-length', r.headers['content-length'])
  console.log('VERDICT:', r.status === 200 && r.body.length === 0 ? 'reproduced (200 with empty body)' : 'not reproduced')
})

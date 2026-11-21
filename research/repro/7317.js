// #7317 Host header with userinfo: req.hostname returns the userinfo part
const { run, express } = require('./_req')
const app = express()
app.get('/', (req, res) => res.json({ host: req.host, hostname: req.hostname }))
run(app, 39220, { headers: { Host: 'evil.example:x@good.example' } }).then((r) => {
  if (r.error || r.status !== 200) { console.log('Node rejected the request:', r.error || r.status); console.log('VERDICT: not reproduced (Node http parser rejects it)'); return }
  const o = JSON.parse(r.body); console.log(JSON.stringify(o))
  console.log('VERDICT:', o.hostname === 'evil.example' ? 'reproduced (hostname taken from the userinfo)' : 'not reproduced')
})

// #7532 req.subdomains splits an IPv6 host that contains dots
const { run, express } = require('./_req')
const app = express()
app.get('/', (req, res) => res.json({ hostname: req.hostname, subdomains: req.subdomains }))
run(app, 39206, { headers: { Host: '[::ffff:127.0.0.1]:39206' } }).then((r) => {
  const out = JSON.parse(r.body)
  console.log(JSON.stringify(out))
  console.log('VERDICT:', out.subdomains.length ? 'reproduced (IP literal split into subdomains)' : 'not reproduced')
})

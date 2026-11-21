// #4298 req.params is gone in on-finished after res.format() sends its default 406
const { run, express } = require('./_req')
const app = express()
let seen = 'unset'
app.get('/u/:id', (req, res) => {
  res.on('finish', () => { seen = req.params && req.params.id })
  res.format({ 'application/json': () => res.json({}) })
})
app.use((err, req, res, next) => res.status(err.status || 500).end())
run(app, 39230, { path: '/u/42', headers: { Accept: 'text/csv' } }).then((r) => setTimeout(() => {
  console.log('status', r.status, '| req.params.id in finish:', seen)
  console.log('VERDICT:', seen === '42' ? 'not reproduced on master' : 'reproduced')
}, 50))

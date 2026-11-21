// #2526 an error-handling function passed to app.get(path, errFn, fn) is not called for errors from earlier layers
const { run, express } = require('./_req')
const app = express()
app.all('/{*splat}', (req, res, next) => next(new Error('fabricated error')))
app.get('/', (err, req, res, next) => next(), (req, res) => res.sendStatus(204))
app.use((err, req, res, next) => res.status(500).send('fell through to app error handler'))
run(app, 39229).then((r) => {
  console.log(r.status, r.body.toString())
  console.log('VERDICT:', r.status === 500 ? 'reproduced (route-level error handler skipped; by design since 4.x?)' : 'not reproduced')
})

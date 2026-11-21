// #7467 / #4750 res.sendFile(path, { etag: false }) is overridden by the app "etag" setting
const path = require('node:path')
const { run, express } = require('./_req')
const app = express()
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '_req.js'), { etag: false }))
run(app, 39218).then((r) => {
  console.log('status', r.status, 'ETag:', r.headers.etag)
  console.log('VERDICT:', r.headers.etag ? 'reproduced (per-call etag:false ignored)' : 'not reproduced')
})

// #7510 res.send(DataView) drops the bytes
const { run, express } = require('./_req')
const app = express()
app.get('/', (req, res) => res.send(new DataView(new Uint8Array([0, 1, 2, 3, 0]).buffer)))
run(app, 39202).then((r) => {
  console.log(r.status, r.headers['content-type'], 'content-length=' + r.headers['content-length'], 'bytes=' + r.body.length)
  console.log('VERDICT:', r.body.length === 0 ? 'reproduced (200 with empty body)' : 'not reproduced')
})

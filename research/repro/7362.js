// #7362 res.send(ArrayBuffer) sends {} as JSON
const { run, express } = require('./_req')
const app = express()
app.get('/', (req, res) => res.send(new Uint8Array([1, 2, 3]).buffer))
run(app, 39201).then((r) => {
  console.log(r.status, r.headers['content-type'], JSON.stringify(r.body.toString()))
  const bug = r.body.toString() === '{}'
  console.log('VERDICT:', bug ? 'reproduced (3 bytes became "{}" JSON)' : 'not reproduced')
})

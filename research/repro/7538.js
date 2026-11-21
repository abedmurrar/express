// #7538 res.send(Uint16Array) loses data (etag on) or 500s (etag off, small payload)
const { run, express } = require('./_req')
async function main () {
  const a = express()
  a.get('/', (req, res) => res.send(new Uint16Array([0x0102, 0x0304])))
  const r1 = await run(a, 39203)
  console.log('etag on :', r1.status, 'bytes=' + r1.body.length, JSON.stringify([...r1.body]), '(expected 4 bytes)')
  const b = express()
  b.set('etag', false)
  b.get('/', (req, res) => res.send(new Uint16Array([0x0102, 0x0304])))
  const r2 = await run(b, 39204)
  console.log('etag off:', r2.status, 'bytes=' + r2.body.length)
  const bug = r1.body.length !== 4 || r2.status !== 200
  console.log('VERDICT:', bug ? 'reproduced' : 'not reproduced')
}
main()

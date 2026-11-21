// #7034 res.set('Content-Type', <unknown shorthand>) sends the literal header "false"
const { run, express } = require('./_req')
const app = express()
app.get('/', (req, res) => { res.set('Content-Type', 'not-a-known-type'); res.end('x') })
run(app, 39208).then((r) => {
  console.log('Content-Type:', JSON.stringify(r.headers['content-type']))
  console.log('VERDICT:', r.headers['content-type'] === 'false' ? 'reproduced' : 'not reproduced')
})

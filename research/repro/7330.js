// #7330 trusted X-Forwarded-Proto: HTTPS (upper case) gives req.secure === false
const { run, express } = require('./_req')
const app = express()
app.set('trust proxy', true)
app.get('/', (req, res) => res.json({ protocol: req.protocol, secure: req.secure }))
run(app, 39219, { headers: { 'X-Forwarded-Proto': 'HTTPS' } }).then((r) => {
  const o = JSON.parse(r.body); console.log(JSON.stringify(o))
  console.log('VERDICT:', o.secure === false ? 'reproduced' : 'not reproduced')
})

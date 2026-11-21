// #5150 res.cookie with maxAge always adds Expires, even with expires: 0
const { run, express } = require('./_req')
const app = express()
app.get('/', (req, res) => { res.cookie('a', 'b', { maxAge: 60000, expires: 0 }); res.end() })
run(app, 39217).then((r) => {
  const c = r.headers['set-cookie'][0]
  console.log(c)
  console.log('VERDICT:', /Expires=/.test(c) ? 'reproduced (Expires added despite expires: 0)' : 'not reproduced')
})

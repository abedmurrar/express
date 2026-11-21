// PR #7161 res.jsonp() with a callback that sanitizes to "" sends "/**/ typeof  === 'function' && (...)" (invalid JS)
const { run, express } = require('./_req')
const app = express()
app.get('/', (req, res) => res.jsonp({ a: 1 }))
run(app, 39224, { path: '/?callback=!!!' }).then((r) => {
  const body = r.body.toString(); console.log(r.headers['content-type'], JSON.stringify(body.slice(0, 80)))
  console.log('VERDICT:', /typeof\s+===/.test(body) ? 'reproduced (syntactically invalid JS body)' : 'not reproduced')
})

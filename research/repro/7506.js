// #7506 res.redirect() sets Content-Length even when Transfer-Encoding is set
const { run, express } = require('./_req')
const app = express()
app.use((req, res) => { res.set('Transfer-Encoding', 'chunked'); res.redirect('http://example.com/') })
run(app, 39205).then((r) => {
  console.log(r.error ? 'client error: ' + r.error : r.status + ' ' + JSON.stringify(r.headers))
  console.log('VERDICT:', r.error && /Content-Length/i.test(r.error) ? 'reproduced (Node client rejects the response)' : 'not reproduced')
})

// PR #7541 res.render(view, options) writes _locals onto the caller's options object (frozen object -> request fails)
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path')
const { run, express } = require('./_req')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r7541-'))
fs.writeFileSync(path.join(dir, 'v.tmpl'), 'x')
const app = express()
app.engine('tmpl', (f, o, cb) => cb(null, 'ok'))
app.set('views', dir); app.set('view engine', 'tmpl')
const shared = { title: 't' }
app.get('/a', (req, res) => res.render('v', shared))
app.get('/b', (req, res) => res.render('v', Object.freeze({ title: 't' })))
async function main () {
  await run(app, 39221, { path: '/a' })
  const b = await run(app, 39222, { path: '/b' })
  fs.rmSync(dir, { recursive: true })
  console.log('shared options keys after render:', Object.keys(shared), '| frozen options ->', b.status)
  console.log('VERDICT:', ('_locals' in shared) || b.status === 500 ? 'reproduced' : 'not reproduced')
}
main()

// #2281 strict Router with a '/' route, mounted at '/strict/', still answers '/strict' (no trailing slash)
const { run, express } = require('./_req')
async function main () {
  const app = express({ strict: true })
  app.set('strict routing', true)
  const r = express.Router({ strict: true })
  r.get('/', (req, res) => res.send('hi'))
  app.use('/strict/', r)
  const a = await run(app, 39213, { path: '/strict' })
  const b = await run(app, 39214, { path: '/strict/' })
  console.log('/strict ->', a.status, '| /strict/ ->', b.status)
  console.log('VERDICT:', a.status === 200 ? 'reproduced (strict routing ignored for the mount path)' : 'not reproduced')
}
main()

// #5878 extended query parser silently drops params past 1000; #7151 repeated keys past 20 become an object
const { run, express } = require('./_req')
async function main () {
  const app = express()
  app.set('query parser', 'extended')
  app.get('/', (req, res) => res.json({ n: Object.keys(req.query).length, ids: Array.isArray(req.query.ids) ? 'array' : typeof req.query.ids, idsLen: req.query.ids && Object.keys(req.query.ids).length }))
  const many = Array.from({ length: 1200 }, (_, i) => 'k' + i + '=' + i).join('&')
  const r1 = JSON.parse((await run(app, 39209, { path: '/?' + many })).body)
  console.log('1200 distinct keys ->', r1.n, 'keys parsed, status 200, no error')
  const rep = Array.from({ length: 21 }, (_, i) => 'ids=' + i).join('&')
  const r2 = JSON.parse((await run(app, 39210, { path: '/?' + rep })).body)
  console.log('21 x ids= ->', r2.ids, 'with', r2.idsLen, 'entries')
  const simple = express()
  simple.get('/', (req, res) => res.json({ n: Object.keys(req.query).length }))
  const r3 = JSON.parse((await run(simple, 39211, { path: '/?' + many })).body)
  console.log('default (simple) parser, 1200 keys ->', r3.n)
  console.log('VERDICT:', r1.n < 1200 ? 'reproduced with "extended" parser (silent truncation)' : 'not reproduced', '|', r2.ids !== 'array' ? '#7151 reproduced (array turns into object)' : '#7151 not reproduced', '| default parser keeps', r3.n)
}
main()

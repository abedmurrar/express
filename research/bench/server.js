// usage: node server.js <target> <scenario> <port>
const [target, scenario, port] = process.argv.slice(2)
const p = Number(port)
const ready = () => process.send ? process.send('ready') : console.log('ready')
const body = { hello: 'world', n: 42, list: [1, 2, 3], nested: { a: true, b: 'x' } }
if (target === 'fastify') {
  const app = require('fastify')()
  if (scenario === 'mw10') for (let i = 0; i < 10; i++) app.addHook('onRequest', (req, reply, done) => { req['m' + i] = i; done() })
  if (scenario === 'routes100') for (let i = 0; i < 100; i++) app.get(`/r${i}/:id`, (req, reply) => reply.send(req.params.id))
  if (scenario === 'json') app.get('/', { schema: { response: { 200: { type: 'object', properties: { hello: { type: 'string' }, n: { type: 'number' }, list: { type: 'array', items: { type: 'number' } }, nested: { type: 'object', properties: { a: { type: 'boolean' }, b: { type: 'string' } } } } } } } }, () => body)
  else if (scenario === 'json-noschema') app.get('/', () => body)
  else app.get('/', (req, reply) => reply.send('Hello World!'))
  app.listen({ port: p, host: '127.0.0.1' }).then(ready)
} else {
  const mod = { e530: 'express-530', master: './express-master', pr7555: './express-pr7555' }[target]
  const app = require(mod)()
  if (scenario === 'mw10') for (let i = 0; i < 10; i++) app.use((req, res, next) => { req['m' + i] = i; next() })
  if (scenario === 'routes100') for (let i = 0; i < 100; i++) app.get(`/r${i}/:id`, (req, res) => res.send(req.params.id))
  if (scenario === 'json' || scenario === 'json-noschema') app.get('/', (req, res) => res.json(body))
  else app.get('/', (req, res) => res.send('Hello World!'))
  app.listen(p, '127.0.0.1', ready)
}

// The public API, used the way the Express docs use it. This file is CommonJS
// (the package has no "type": "module"), so `express` resolves to
// typings/index.d.ts and the default import goes through esModuleInterop.

import { createServer, type Server } from 'node:http'
import express, { type Application, type Express, type Request, type Response, type Router } from 'express'

const app: Express = express()
const asApplication: Application = app

// settings
app.set('view engine', 'ejs')
app.set('view engines', ['html', 'pug'])
app.set('view engines', 'pug')
app.set('trust proxy', 1)
const setting: any = app.get('view engine')
app.enable('strict routing')
app.disable('x-powered-by')
const enabled: boolean = app.enabled('etag')
const disabled: boolean = app.disabled('etag')
const settings: any = app.settings
app.locals.title = 'My App'
const mountpath: string | string[] = app.mountpath
const path: string = app.path()

// templates
app.engine('html', (file: string, options: object, callback: (e: any, rendered?: string) => void) => {
  callback(null, file + JSON.stringify(options))
})
app.render('email', { name: 'Tobi' }, (err: Error, html: string) => {
  void err
  void html
})
app.render('email', (err: Error, html: string) => {
  void err
  void html
})

// listen: every overload returns the http.Server
const servers: Server[] = [
  app.listen(),
  app.listen(3000),
  app.listen(3000, () => {}),
  app.listen(3000, 'localhost'),
  app.listen(3000, 'localhost', (error?: Error) => {
    void error
  }),
  app.listen(3000, 'localhost', 511, () => {}),
  app.listen('/tmp/app.sock'),
  app.listen({ port: 0 })
]
createServer(app)

// routing
app.get('/', (req, res) => {
  res.send('hello world')
})
app.post('/', (_req, res) => res.json({ ok: true }))
app.put('/user/:id', (req, res) => res.send(req.params.id))
app.delete('/user/:id', (_req, res) => res.sendStatus(204))
app.patch('/user/:id', (_req, res) => res.status(200).end())
app.options('/', (_req, res) => res.set('Allow', 'GET').end())
app.head('/', (_req, res) => res.end())
app.all('/secret', (_req, _res, next) => next())
app.query?.('/reports', (_req, res) => res.send('ok'))
app.get(/.*fly$/, (req, res) => res.send(req.params[0]))
app.get(['/a', '/b'], (_req, res) => res.end())
app
  .route('/book')
  .get((_req, res) => res.send('Get a random book'))
  .post((_req, res) => res.send('Add a book'))
  .put((_req, res) => res.send('Update the book'))

app.param('id', (req, _res, next, value: any, name: string) => {
  void req
  void value
  void name
  next()
})

// routers and sub-apps
const router: Router = express.Router({ caseSensitive: true, mergeParams: true, strict: false })
router.use((_req, _res, next) => next())
router.get('/', (_req, res) => res.send('birds'))
router.param('bird', (_req, _res, next) => next())
router.route('/about').get((_req, res) => res.send('about'))
app.use('/birds', router)
const admin = express()
admin.on('mount', (parent) => {
  const parentApp: Application = parent
  void parentApp
})
app.use('/admin', admin)
const stack: express.IRouter['stack'] = router.stack
const route: express.IRoute = new express.Route('/x')

// built-in middleware
app.use(express.json())
app.use(express.json({ limit: '1mb', strict: false, type: ['application/json', 'application/*+json'] }))
app.use(
  express.json({
    reviver: (key: string, value: any) => (key === 'date' ? new Date(value) : value),
    verify: (req, _res, buf, encoding) => {
      void req.headers
      void buf.length
      void encoding
    },
    defaultCharset: 'utf-8'
  })
)
app.use(express.raw({ type: 'application/octet-stream', inflate: false }))
app.use(express.text({ defaultCharset: 'utf-8', type: (req) => req.headers['content-type'] === 'text/csv' }))
app.use(
  express.urlencoded({
    extended: true,
    parameterLimit: 100,
    depth: 5,
    charsetSentinel: true,
    interpretNumericEntities: true,
    defaultCharset: 'iso-8859-1'
  })
)
app.use(express.static('public'))
app.use(
  '/static',
  express.static('public', {
    dotfiles: 'ignore',
    etag: true,
    extensions: ['htm', 'html'],
    fallthrough: true,
    immutable: true,
    index: false,
    maxAge: '1d',
    redirect: false,
    setHeaders: (res, filePath: string) => {
      res.set('x-timestamp', String(Date.now()))
      void filePath
    }
  })
)

// the prototypes
express.application.set('etag', false)
const reqProto: Request = express.request
const resProto: Response = express.response

// request
app.get('/request', (req, res) => {
  const header: string | undefined = req.get('content-type')
  const cookies: string[] | undefined = req.header('set-cookie')
  const accepted: string | false = req.accepts('html')
  const acceptedList: string | false = req.accepts(['json', 'text'])
  const all: string[] = req.accepts()
  const charset: string | false = req.acceptsCharsets('utf-8')
  const encoding: string | false = req.acceptsEncodings('gzip', 'deflate')
  const language: string | false = req.acceptsLanguages(['en', 'fr'])
  const is: string | false | null = req.is('json')
  const range = req.range(1000, { combine: true })
  if (range !== undefined && range !== -1 && range !== -2) {
    const first: number = range[0]?.start ?? 0
    const unit: string = range.type
    void first
    void unit
  }
  const values: Array<string | boolean | string[] | undefined> = [
    req.protocol,
    req.secure,
    req.ip,
    req.ips,
    req.subdomains,
    req.path,
    req.hostname,
    req.host,
    req.fresh,
    req.stale,
    req.xhr,
    req.originalUrl,
    req.baseUrl,
    req.url,
    req.method
  ]
  const appFromReq: Application = req.app
  void [header, cookies, accepted, acceptedList, all, charset, encoding, language, is, values, appFromReq]
  void req.cookies
  void req.signedCookies
  void req.route
  void req.res
  // the fork's req.originalRoute: a string, or undefined, and read-only
  const originalRoute: string | undefined = req.originalRoute
  // @ts-expect-error it is read-only
  req.originalRoute = '/x'
  void originalRoute
  res.end()
})

// response
app.get('/response', (_req, res) => {
  res.status(201).set('X-A', 'b').set({ 'X-B': 'c' }).append('Link', ['<http://a>', '<http://b>'])
  res.header('X-C', 'd').type('json').contentType('text/html').vary('Accept').attachment().attachment('file.pdf')
  res.links({ next: 'http://api.example.com/users?page=2' })
  res.cookie('name', 'tobi', {
    domain: '.example.com',
    path: '/admin',
    secure: true,
    httpOnly: true,
    expires: new Date(Date.now() + 900000),
    maxAge: 900000,
    signed: false,
    sameSite: 'strict',
    priority: 'high',
    partitioned: true,
    encode: String
  })
  res.cookie('cart', { items: [1, 2, 3] })
  res.clearCookie('name', { path: '/admin' })
  res.location('/foo/bar')
  const contentType: string | undefined = res.get('Content-Type')
  const sent: boolean = res.headersSent
  res.charset = 'utf-8'
  res.locals.user = 'tobi'
  res.format({
    text: () => res.send('hey'),
    html: () => res.send('<p>hey</p>'),
    default: () => res.status(406).send('Not Acceptable')
  })
  res.render('index', { title: 'Hey' })
  res.render('index', (err: Error, html: string) => res.send(html || err.message))
  res.jsonp({ user: 'tobi' })
  res.redirect('/foo/bar')
  res.redirect(301, 'http://example.com')
  res.sendFile('/uploads/file.txt')
  res.sendFile('file.txt', { root: '/uploads', dotfiles: 'deny', headers: { 'x-sent': true }, maxAge: 1000 }, (err) => {
    void err
  })
  res.download('/report.pdf')
  res.download('/report.pdf', 'report.pdf')
  res.download('/report.pdf', 'report.pdf', (err) => {
    void err
  })
  res.download('/report.pdf', 'report.pdf', { headers: { 'x-a': 'b' }, root: '/' }, () => {})
  const fromRes: Application = res.app
  void [contentType, sent, fromRes]
})

// error handling middleware
app.use((err: Error, _req: Request, res: Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err)
  res.status(500).send(err.message)
})

void [asApplication, setting, enabled, disabled, settings, mountpath, path, servers, stack, route, reqProto, resProto]

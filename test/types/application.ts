// Every member of the app, router and route types, with the overloads of the
// routing methods, and what express() and express.Router() return.

import { EventEmitter } from 'node:events'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import express, {
  type Application,
  type ErrorRequestHandler,
  type Express,
  type IRoute,
  type IRouter,
  type Request,
  type RequestHandler,
  type Response,
  type Router,
  type RouterWithErrorHandlers
} from 'express'
import type * as core from '../../typings/core.js'
import { exactly } from './exact.js'

type Any = ReturnType<typeof JSON.parse>

const app = express()
const router = express.Router()
const handler: RequestHandler = (_req, _res, next) => next()
const onError: ErrorRequestHandler = (_err, _req, _res, next) => next()

// what the factories return
exactly<core.Express>()(app)
exactly<core.RouterWithErrorHandlers>()(router)
exactly<core.IRoute>()(new express.Route('/x'))
const asExpress: Express = app
const asApplication: Application = app
const asRouter: Router = router
const asIRouter: IRouter = router
const asRouterWithErrorHandlers: RouterWithErrorHandlers = router
const asRoute: IRoute = new express.Route('/x')
const emitter: EventEmitter = app
const appAsHandler: RequestHandler = app
const routerAsHandler: RequestHandler = router
void [asExpress, asApplication, asRouter, asIRouter, asRouterWithErrorHandlers, asRoute, emitter]
void [appAsHandler, routerAsHandler]

// settings
exactly<core.Express>()(app.set('etag', false))
exactly<Any>()(app.get('etag'))
exactly<core.Express>()(app.enable('trust proxy'))
exactly<core.Express>()(app.disable('trust proxy'))
exactly<boolean>()(app.enabled('trust proxy'))
exactly<boolean>()(app.disabled('trust proxy'))
exactly<Any>()(app.settings)
// @ts-expect-error
app.set(1, 2)
// @ts-expect-error
app.enable()
// @ts-expect-error
app.disable(1)
// @ts-expect-error
app.enabled(1)
// @ts-expect-error
app.disabled(1)

// the app itself
exactly<Record<string, Any> & core.Locals>()(app.locals)
exactly<string | string[]>()(app.mountpath)
exactly<string>()(app.path())
exactly<core.Router>()(app.router)
exactly<core.Request>()(app.request)
exactly<core.Response>()(app.response)
exactly<void>()(app.init())
exactly<void>()(app.defaultConfiguration())
exactly<core.RouteInfo[]>()(app.listRoutes())
exactly<core.RouteInfo[]>()(router.listRoutes())
exactly<string | RegExp>()(({} as core.RouteInfo).path)
exactly<core.RouteInfo[] | undefined>()(({} as core.MountedRouter).listRoutes?.())
exactly<core.Express>()(app.on('mount', (parent) => exactly<core.Application>()(parent)))
exactly<Any>()(app({} as IncomingMessage, {} as ServerResponse))
exactly<unknown>()(app({} as Request, {} as Response, () => {}))
exactly<unknown>()(router({} as Request, {} as Response, () => {}))
createServer(app)
// Express 4's, which Express 5 doesn't have
exactly<Any>()(app.resource)
exactly<Any>()(app.map)
exactly<Any>()(app.routes)
exactly<Any>()(app._router)
exactly<core.ILayer[]>()(app.stack)
// @ts-expect-error
app.path('/x')
// @ts-expect-error
app.on('mount', (parent: string) => parent)

// views
exactly<core.Express>()(app.engine('html', (_path, _options, done) => done(null, 'html')))
exactly<void>()(app.render('view'))
exactly<void>()(app.render('view', { title: 'a' }))
exactly<void>()(
  app.render('view', { title: 'a' }, (err, html) => {
    exactly<Error>()(err)
    exactly<string>()(html)
  })
)
// a function fits the options too, so it isn't typed as the callback
app.render('view', (err: Error, html: string) => void [err, html])
// @ts-expect-error
app.engine('html')
// @ts-expect-error
app.render()

// listen
exactly<Server>()(app.listen())
exactly<Server>()(app.listen((error) => exactly<Error | undefined>()(error)))
exactly<Server>()(app.listen(3000))
exactly<Server>()(app.listen(3000, (error) => exactly<Error | undefined>()(error)))
exactly<Server>()(app.listen(3000, 'localhost'))
exactly<Server>()(app.listen(3000, 'localhost', (error) => exactly<Error | undefined>()(error)))
exactly<Server>()(app.listen(3000, 'localhost', 511))
exactly<Server>()(app.listen(3000, 'localhost', 511, (error) => exactly<Error | undefined>()(error)))
exactly<Server>()(app.listen('/tmp/app.sock'))
exactly<Server>()(app.listen('/tmp/app.sock', (error) => exactly<Error | undefined>()(error)))
exactly<Server>()(app.listen({ port: 0 }, (error) => exactly<Error | undefined>()(error)))
// @ts-expect-error
app.listen(3000, 'localhost', 511, 'not a callback')

// param, on both
exactly<core.Express>()(app.param('id', (_req, _res, next) => next()))
exactly<core.Express>()(app.param(['id', 'page'], (_req, _res, next) => next()))
exactly<core.RouterWithErrorHandlers>()(router.param('id', (_req, _res, next) => next()))
// @ts-expect-error
app.param(1, handler)
// @ts-expect-error
router.param('id')

// A routing method (IRouterMatcher): a path, then handlers, in each form.
type UserParams = { id: string }
exactly<core.Express>()(app.post('/:id', handler))
exactly<core.Express>()(app.post('/:id', [handler, handler], onError))
exactly<core.Express>()(app.post('/:id', onError))
exactly<core.Express>()(app.post<UserParams>(['/:id', /x/], (req, res) => void [exactly<string>()(req.params.id), res]))
exactly<core.Express>()(app.post(['/a', '/b'], (req, res) => void [req, res]))
exactly<core.Express>()(app.post(['/a', '/b'], [handler], onError))
exactly<core.Express>()(app.post(/x/, handler))
exactly<core.Express>()(app.post('/sub', express()))
app.post<'/:id', UserParams, { ok: boolean }, { name: string }, { page?: string }, { user: string }>(
  '/:id',
  (req, res) => {
    exactly<{ name: string }>()(req.body)
    exactly<{ page?: string }>()(req.query)
    exactly<string>()(res.locals.user)
    res.json({ ok: true })
    // @ts-expect-error
    res.json({})
  }
)
// @ts-expect-error a path
app.post(handler)
// @ts-expect-error
app.post('/x', 'not a handler')
// @ts-expect-error
app.post(1, handler)

// A method without a path (IRouterHandler): use() and a route's methods.
exactly<core.Express>()(app.use(handler))
exactly<core.Express>()(app.use(handler, [handler], onError))
exactly<core.Express>()(app.use('/x', handler))
exactly<core.Express>()(app.use('/x', router, express()))
exactly<core.Express>()(app.use(['/a', /b/], handler))
exactly<core.RouterWithErrorHandlers>()(router.use(handler))
exactly<core.RouterWithErrorHandlers>()(router.use('/x', handler, [handler], onError))
exactly<core.RouterWithErrorHandlers>()(router.use(router, app))
app.use<UserParams, { ok: boolean }, { name: string }, { page?: string }, { user: string }>((req, res, next) => {
  exactly<string>()(req.params.id)
  exactly<{ name: string }>()(req.body)
  exactly<{ page?: string }>()(req.query)
  exactly<string>()(res.locals.user)
  next()
})
declare const userHandler: RequestHandler<UserParams>
exactly<core.Express>()(app.use<UserParams>(userHandler))
exactly<core.Express>()(app.use<UserParams>(userHandler, [handler], onError))
// @ts-expect-error
app.use(1)
// @ts-expect-error
app.use('/x', 1)
// @ts-expect-error
router.use('/x', 'not a handler')

// error handlers (IRouterErrorMatcher)
exactly<core.Express>()(app.error(onError))
exactly<core.Express>()(app.error((err, _req, res) => void [exactly<Any>()(err), res]))
exactly<core.Express>()(app.error('/:id', (_err, req, res) => void [exactly<string>()(req.params.id), res]))
exactly<core.Express>()(app.error(['/a', /b/], onError, [onError]))
exactly<core.RouterWithErrorHandlers>()(router.error(onError))
// @ts-expect-error
router.error(1)

// every HTTP method, on the app, a router and a route
app.query?.('/x', handler)
router.query?.('/x', handler)
app.all('/x', handler).get('/x', handler).post('/x', handler).put('/x', handler).delete('/x', handler)
app.patch('/x', handler).options('/x', handler).head('/x', handler).checkout('/x', handler).connect('/x', handler)
app.copy('/x', handler).lock('/x', handler).merge('/x', handler).mkactivity('/x', handler).mkcol('/x', handler)
app.move('/x', handler)['m-search']('/x', handler).notify('/x', handler).propfind('/x', handler)
app.proppatch('/x', handler).purge('/x', handler).report('/x', handler).search('/x', handler).subscribe('/x', handler)
app.trace('/x', handler).unlock('/x', handler).unsubscribe('/x', handler).link('/x', handler)
exactly<core.Express>()(app.unlink('/x', handler))
router.all('/x', handler).get('/x', handler).post('/x', handler).put('/x', handler).delete('/x', handler)
router.patch('/x', handler).options('/x', handler).head('/x', handler).checkout('/x', handler).connect('/x', handler)
router.copy('/x', handler).lock('/x', handler).merge('/x', handler).mkactivity('/x', handler).mkcol('/x', handler)
router.move('/x', handler)['m-search']('/x', handler).notify('/x', handler).propfind('/x', handler)
router.proppatch('/x', handler).purge('/x', handler).report('/x', handler).search('/x', handler).trace('/x', handler)
router.subscribe('/x', handler).unlock('/x', handler).unsubscribe('/x', handler).link('/x', handler)
exactly<core.RouterWithErrorHandlers>()(router.unlink('/x', handler))

const route = app.route('/:id')
exactly<core.IRoute<'/:id'>>()(route)
exactly<core.IRoute<'/:id'>>()(router.route('/:id'))
exactly<core.IRoute>()(app.route(['/a', /b/]))
exactly<core.IRoute>()(router.route(['/a', /b/]))
exactly<string>()(route.path)
exactly<core.ILayer[]>()(route.stack)
route.all(handler).get(handler).post(handler).put(handler).delete(handler).patch(handler).options(handler)
route.head(handler).checkout(handler).copy(handler).lock(handler).merge(handler).mkactivity(handler).mkcol(handler)
route.move(handler)['m-search'](handler).notify(handler).purge(handler).report(handler).search(handler)
route.subscribe(handler).trace(handler).unlock(handler)
exactly<core.IRoute<'/:id'>>()(route.unsubscribe(handler))
route.get((req, res) => void [exactly<string>()(req.params.id), res])
route.get(handler, onError)
route.get([handler], onError)
exactly<core.IRoute<'/:id'>>()(route.get<UserParams>(userHandler))
exactly<core.IRoute<'/:id'>>()(route.get<UserParams>(userHandler, [handler], onError))
route.get<UserParams, { ok: boolean }>((req, res) => void [req.params.id, res.json({ ok: true })])
// @ts-expect-error a route's methods take no path
route.get('/x', handler)
// @ts-expect-error
route.post()(1)
// @ts-expect-error
app.route()

// the stack
for (const layer of router.stack) {
  exactly<core.IRoute | undefined>()(layer.route)
  exactly<string>()(layer.name)
  exactly<Record<string, Any> | undefined>()(layer.params)
  exactly<string[]>()(layer.keys)
  exactly<string | undefined>()(layer.path)
  exactly<string>()(layer.method)
  exactly<boolean | undefined>()(layer.errorOnly)
  exactly<RegExp>()(layer.regexp)
  exactly<Any>()(layer.handle({} as core.Request, {} as core.Response, () => {}))
}

// next()
exactly<void>()(({} as core.NextFunction)())
exactly<void>()(({} as core.NextFunction)(new Error('x')))
exactly<void>()(({} as core.NextFunction)('route'))
exactly<void>()(({} as core.NextFunction)('router'))

// app.locals of a type
exactly<string>()(({} as core.Application<{ title: string }>).locals.title)

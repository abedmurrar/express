// Route handlers with typed params, body, query and locals, the parameters
// inferred from path strings, async handlers, middleware and error handlers.

import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type ParamsDictionary,
  type Query,
  type Request,
  type RequestHandler,
  type Response
} from 'express'

const app = express()

// Parameters inferred from the path string.
app.get('/users/:id', (req, res) => {
  const id: string = req.params.id
  res.send(id)
})
app.get('/users/:userId/books/:bookId', (req, res) => {
  const both: [string, string] = [req.params.userId, req.params.bookId]
  res.json(both)
})
app.get('/files/*path', (req, res) => {
  const segments: string[] = req.params.path
  res.send(segments.join('/'))
})
app.get('/flights/:from-:to', (req, res) => {
  res.send(req.params.from + req.params.to)
})
app.get('/plantae/:genus.:species', (req, res) => {
  res.send(req.params.genus + req.params.species)
})
app.get('/optional{/:page}', (req, res) => {
  const page: string | undefined = req.params.page
  res.send(page ?? '1')
})
app.get(/^\/commits\/(\w+)$/, (req, res) => {
  const sha: string | undefined = req.params[0]
  res.send(sha)
})
express
  .Router()
  .route('/items/:itemId')
  .get((req, res) => {
    const itemId: string = req.params.itemId
    res.send(itemId)
  })

// Typed params, response body, request body, query and locals.
interface UserParams {
  id: string
}
interface User {
  id: string
  name: string
}
interface NewUser {
  name: string
}
interface ListQuery extends Query {
  page?: string
}
interface AppLocals {
  requestStart: number
}

const getUser: RequestHandler<UserParams, User, never, Query, AppLocals> = (req, res) => {
  const started: number = res.locals.requestStart
  void started
  res.json({ id: req.params.id, name: 'Tobi' })
}
app.get('/typed/:id', getUser)

app.post<ParamsDictionary, User, NewUser>('/typed', (req, res) => {
  const name: string = req.body.name
  res.status(201).json({ id: '1', name })
})

app.get('/list', (req: Request<ParamsDictionary, User[], unknown, ListQuery>, res: Response<User[]>) => {
  const page: string | undefined = req.query.page
  void page
  res.json([])
})

function withLocals(_req: Request, res: Response<unknown, AppLocals>, next: NextFunction) {
  res.locals.requestStart = Date.now()
  next()
}
app.use(withLocals)

// Request handlers may return anything, including a promise (Express 5
// passes a rejection to next).
app.get('/async', async (_req, res) => {
  await Promise.resolve()
  res.send('done')
})
app.get('/returns', (_req, res) => res.json({ returned: true }))
const asyncMiddleware: RequestHandler = async (_req, _res, next) => {
  await Promise.resolve()
  next()
}
app.use(asyncMiddleware)

// next() forms
app.get(
  '/next',
  (_req, _res, next) => next('route'),
  (_req, _res, next) => next('router'),
  (_req, _res, next) => next(new Error('boom')),
  (_req, _res, next) => next()
)

// error handlers
const onError: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err)
    return
  }
  res.status(500).json({ message: String(err) })
}
app.use(onError)
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).send(err instanceof Error ? err.message : 'error')
})
app.get('/mixed', [asyncMiddleware, asyncMiddleware], onError)

// app.error() and router.error() (a fork addition): error
// handlers of any length, contextually typed, with an optional path as use().
app.error((err, req, res) => {
  const message: string = err instanceof Error ? err.message : String(err)
  const url: string = req.originalUrl
  res.status(500).send(message + url)
})
app.error(onError, [onError, (_err, _req, _res, next) => next()])
app.error('/users/:id', (_err, req, res) => {
  const id: string = req.params.id
  res.send(id)
})
app.error(['/a', /^\/b/], onError)
app.error(async (_err, _req, res) => {
  await Promise.resolve()
  res.end()
})
const chained: express.Express = app.error(onError).error('/x', onError)
void chained
const errorRouter: express.Router = express.Router().error(onError).error('/x', onError)
void errorRouter
// @ts-expect-error a handler, not a value
app.error(42)
// @ts-expect-error a handler, not a value
express.Router().error('/x', 'nope')

// A handler typed with the base http types still fits.
app.use((req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => {
  void req.url
  void res.statusCode
  next()
})

// CookieOptions.priority takes undefined like the other options (strict mode
// here has exactOptionalPropertyTypes).
const cookie: express.CookieOptions = { priority: undefined, sameSite: undefined }
void cookie

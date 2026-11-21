// A small app in the style of the @types/express documentation and its tests:
// middleware factories, a typed router module, error classes and async code.

import express, { type Application, type NextFunction, type Request, type Response, Router } from 'express'

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

function requestLogger(prefix: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    void `${prefix} ${req.method} ${req.originalUrl}`
    next()
  }
}

function asyncHandler<P, ResBody, ReqBody>(
  fn: (req: Request<P, ResBody, ReqBody>, res: Response<ResBody>) => Promise<void>
): express.RequestHandler<P, ResBody, ReqBody> {
  return (req, res, next) => {
    fn(req, res).catch(next)
  }
}

interface Todo {
  id: number
  title: string
}

const todos: Router = Router()
todos.get(
  '/',
  asyncHandler<{}, Todo[], unknown>(async (_req, res) => {
    res.json([{ id: 1, title: 'write types' }])
  })
)
todos.get('/:id', (req, res, next) => {
  const id = Number(req.params.id)
  if (Number.isNaN(id)) return next(new HttpError(400, 'bad id'))
  res.json({ id, title: 'write types' })
})
todos.post('/', express.json(), (req: Request<{}, Todo, { title: string }>, res: Response<Todo>) => {
  res.status(201).json({ id: 2, title: req.body.title })
})

export function createApp(): Application {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback')
  app.use(requestLogger('api'))
  app.use(express.urlencoded({ extended: true }))
  app.use('/public', express.static('public', { maxAge: '1d' }))
  app.use('/todos', todos)
  app.use((_req, res) => {
    res.status(404).json({ error: 'not found' })
  })
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : 500
    res.status(status).json({ error: err.message })
  })
  return app
}

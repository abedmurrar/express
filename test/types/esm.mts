// The ES module entry: `import` resolves to typings/index.d.mts, whose default
// and named exports match index.mjs.

import express, {
  application,
  json,
  raw,
  request,
  response,
  Route,
  Router,
  static as serveStatic,
  text,
  urlencoded,
  type Application,
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response
} from 'express'
import * as namespace from 'express'

const app: Express = express()
app.use(json({ limit: '1mb' }), raw(), text(), urlencoded({ extended: false }), serveStatic('public'))

const router: Router = Router({ mergeParams: true })
router.get('/:id', (req: Request<{ id: string }>, res: Response) => {
  res.send(req.params.id)
})
app.use('/things', router)

const route = new Route('/x')
const proto: Application = application
const handler: RequestHandler = (_req, _res, next: NextFunction) => next()
app.use(handler)

// The namespace object has the same members as the default export.
const sameRouter: typeof express.Router = namespace.Router
const sameStatic: typeof express.static = namespace.static
const sameDefault: typeof express = namespace.default

void [route, proto, request, response, sameRouter, sameStatic, sameDefault]

// Types imported from express-serve-static-core, as code written for
// @types/express does for the names @types/express doesn't re-export. Our
// strict and loose configs map the module to typings/core.d.ts with `paths`.

import express from 'express'
import type {
  NextFunction,
  ParamsDictionary,
  Query,
  Request,
  RequestHandler,
  Response
} from 'express-serve-static-core'
import type * as core from 'express-serve-static-core'

interface Item {
  id: string
}

function listItems(req: Request<ParamsDictionary, Item[], unknown, Query>, res: Response<Item[]>, next: NextFunction) {
  if (typeof req.query.page !== 'string' && req.query.page !== undefined) return next(new Error('bad page'))
  res.json([{ id: '1' }])
}

const auth: RequestHandler = (req, _res, next) => {
  void req.headers.authorization
  next()
}

const app: core.Express = express()
app.get('/items', auth, listItems)

// Types from either module are interchangeable.
const fromCore: express.RequestHandler = auth
const fromExpress: core.RequestHandler = express.json()
const router: core.Router = express.Router()
const params: core.RouteParameters<'/items/:id'> = { id: '1' }
app.use(router, fromCore, fromExpress)
void params

// The exported types that are used by name, from `express` and from the core
// declarations (which `express-serve-static-core` is pointed at).

import express, {
  type Errback,
  type ErrorRequestHandler,
  type Handler,
  type IRouterHandler,
  type IRouterMatcher,
  type Locals,
  type NextFunction,
  type PathParams,
  type Request,
  type RequestHandler,
  type RequestHandlerParams,
  type RequestParamHandler,
  type RouterTraceContext,
  type Response
} from 'express'
import type * as core from '../../typings/core.js'
import { exactly } from './exact.js'

const app = express()

const errback: Errback = (err) => void exactly<Error | undefined>()(err)
const coreErrback: core.Errback = errback
express.response.sendFile('/x', errback)
express.response.sendFile('/x', coreErrback)

const handler: Handler = (req, res, next) => {
  exactly<core.Request>()(req)
  exactly<core.Response>()(res)
  exactly<core.NextFunction>()(next)
}
const coreHandler: core.Handler = handler
const asRequestHandler: RequestHandler = handler
app.use(handler, coreHandler, asRequestHandler)

const onError: core.ErrorRequestHandler = (err, _req, _res, next) => next(err)
const asErrorHandler: ErrorRequestHandler = onError
app.use(onError, asErrorHandler)

const param: RequestParamHandler = (_req, _res, next, _value, name) => {
  exactly<string>()(name)
  next()
}
const coreParam: core.RequestParamHandler = param
app.param('id', coreParam)

const params: RequestHandlerParams[] = [handler, onError, [handler, onError]]
const coreParams: core.RequestHandlerParams[] = params
app.get('/x', ...coreParams)

const paths: PathParams[] = ['/x', /x/, ['/x', /x/]]
const corePaths: core.PathParams[] = paths
app.get(corePaths[0] ?? '/', handler)

const method: IRouterMatcher<typeof app> = app.get
const coreMethod: core.IRouterMatcher<typeof app, 'get'> = app.get
const use: IRouterHandler<typeof app> = app.use
const coreUse: core.IRouterHandler<typeof app> = app.use
const appUse: core.ApplicationRequestHandler<typeof app> = app.use
const error: core.IRouterErrorMatcher<typeof app> = app.error
void [method, coreMethod, use, coreUse, appUse, error]

const router: core.IRouter = express.Router()
const mounted: core.MountedRouter = express.Router()
void [router, mounted]

const locals: Locals = { csrfToken: 'x' }
const coreLocals: core.Locals = locals
void coreLocals

const flat: core.ParamsFlatDictionary = { id: 'x', 0: 'y' }
const anyParams: core.Params[] = [flat, { path: ['a', 'b'] }]
const dictionary: core.Dictionary<number> = { a: 1 }
void [anyParams, dictionary]

const cookie: core.CookieOptions = { path: '/' }
const sendFile: core.SendFileOptions = { root: '/' }
const download: core.DownloadOptions = { root: '/' }
const media: core.MediaType = { value: 'text/html', quality: 1, type: 'text', subtype: 'html' }
const range: core.ByteRange = { start: 0, end: 1 }
exactly<number>()(range.start)
exactly<number>()(range.end)
void [cookie, sendFile, download, media]

declare const trace: RouterTraceContext
exactly<unknown>()(trace.error)
exactly<unknown>()(trace.incomingError)
exactly<unknown>()(trace.result)

// @ts-expect-error a value is needed
const noEnd: core.ByteRange = { start: 0 }
// @ts-expect-error
const badPath: PathParams = 1
// @ts-expect-error
const badDictionary: core.Dictionary<number> = { a: 'x' }
// @ts-expect-error a request handler takes at most three arguments
const tooMany: RequestHandler = (_req: Request, _res: Response, _next: NextFunction, _more: string) => {}
void [noEnd, badPath, badDictionary, tooMany]

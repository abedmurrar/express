// Apps that still have @types/express-serve-static-core installed (other
// @types packages depend on it) mix its types with ours. Handlers, routers,
// requests, responses and options typed with either must fit the other.

import express from 'express'
import type * as core from '../../typings/core.js'
import type * as dt from '../../node_modules/@types/express-serve-static-core/index.js'
import type dtExpress = require('../../node_modules/@types/express/index.js')
import type dtParser = require('../../node_modules/@types/body-parser/index.js')
import type dtSend = require('../../node_modules/@types/send/index.js')
import type dtStatic = require('../../node_modules/@types/serve-static/index.js')

const app = express()

declare const dtHandler: dt.RequestHandler
declare const dtErrorHandler: dt.ErrorRequestHandler
declare const dtRouter: dt.Router
app.use(dtHandler, dtErrorHandler, dtRouter)
app.get('/x/:id', dtHandler)
express.Router().use(dtRouter)

declare const ourHandler: express.RequestHandler
declare const ourRouter: express.Router
declare const dtApp: dt.Express
dtApp.use(ourHandler, ourRouter)
const asDtHandler: dt.RequestHandler = ourHandler

declare const dtRequest: dt.Request
declare const dtResponse: dt.Response
declare const ourRequest: express.Request
declare const ourResponse: express.Response
const fromDtRequest: express.Request = dtRequest
const fromDtResponse: express.Response = dtResponse
const toDtRequest: dt.Request = ourRequest
const toDtResponse: dt.Response = ourResponse
const toDtApp: dt.Express = app
const fromDtApp: express.Express = dtApp

// app.error() (a fork addition) is declared on the global Express.Application
// both kinds of app extend, so an app typed with either has it, and takes an
// error handler typed with either.
app.error(dtErrorHandler)
dtApp.error('/x', dtErrorHandler)
express.Router().error(dtErrorHandler)

// app.listRoutes() (a fork addition) is declared the same way.
const ourRoutes: express.RouteInfo[] = app.listRoutes()
const dtRoutes: express.RouteInfo[] = dtApp.listRoutes()
void [ourRoutes, dtRoutes]

// Routers stay assignable both ways: express.Router has no error() or
// listRoutes() in the types; only what express.Router() returns
// (RouterWithErrorHandlers) does.
const fromDtRouter: express.Router = dtRouter
const fromFactory: express.Router = express.Router()
const toDtRouter: dt.Router = express.Router()
const fromOurRouter: dt.Router = ourRouter

void [fromDtRouter, fromFactory, toDtRouter, fromOurRouter]
void [asDtHandler, fromDtRequest, fromDtResponse, toDtRequest, toDtResponse, toDtApp, fromDtApp]

// The functions, as a value typed with either (a wrapper's parameter, a
// dependency that is injected) takes the other. Their `express.Router` is the
// exception: it doesn't return a router with error().
declare const dtMiddleware: Pick<typeof dtExpress, 'json' | 'raw' | 'static' | 'text' | 'urlencoded'>
declare const ourMiddleware: Pick<typeof express, 'json' | 'raw' | 'static' | 'text' | 'urlencoded'>
const fromDtMiddleware: typeof ourMiddleware = dtMiddleware
const toDtMiddleware: typeof dtMiddleware = ourMiddleware
declare const dtServeStatic: dtStatic.RequestHandlerConstructor<dt.Response>
const fromDtServeStatic: typeof express.static = dtServeStatic
const toDtServeStatic: typeof dtServeStatic = express.static
const toDtRouterFactory: typeof dtExpress.Router = express.Router

// The options, one property per type: the two sides are assigned as a whole,
// and an error names the property. An option of ours can't take
// more values than theirs, or code that passes its options on stops compiling.
interface OurOptions {
  static: express.ServeStaticOptions
  staticResponse: express.ServeStaticOptions<express.Response>
  send: core.SendOptions
  sendFile: express.SendFileOptions
  download: express.DownloadOptions
  router: express.RouterOptions
  raw: express.Options
  json: express.OptionsJson
  text: express.OptionsText
  urlencoded: express.OptionsUrlencoded
}
interface DtOptions {
  static: dtStatic.ServeStaticOptions
  staticResponse: dtStatic.ServeStaticOptions<dt.Response>
  send: dtSend.SendOptions
  sendFile: dt.SendFileOptions
  download: dt.DownloadOptions
  router: dtExpress.RouterOptions
  raw: dtParser.Options
  json: dtParser.OptionsJson
  text: dtParser.OptionsText
  urlencoded: dtParser.OptionsUrlencoded
}
declare const ourOptions: OurOptions
declare const dtOptions: DtOptions
const fromDtOptions: OurOptions = dtOptions
const toDtOptions: DtOptions = ourOptions

// Cookie options differ in two on purpose: ours accept `expires: 0` and
// `priority: undefined`.
declare const dtCookie: dt.CookieOptions
declare const ourCookie: Omit<express.CookieOptions, 'expires' | 'priority'>
const fromDtCookie: express.CookieOptions = dtCookie
const toDtCookie: dt.CookieOptions = ourCookie

void [fromDtMiddleware, toDtMiddleware, fromDtServeStatic, toDtServeStatic, toDtRouterFactory]
void [fromDtOptions, toDtOptions, fromDtCookie, toDtCookie]

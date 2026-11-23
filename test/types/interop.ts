// Apps that still have @types/express-serve-static-core installed (other
// @types packages depend on it) mix its types with ours. Handlers, routers,
// requests and responses typed with either must fit the other.

import express from 'express'
import type * as dt from '../../node_modules/@types/express-serve-static-core/index.js'

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

// Routers stay assignable both ways: express.Router has no error() in the
// types; only what express.Router() returns (RouterWithErrorHandlers) does.
const fromDtRouter: express.Router = dtRouter
const fromFactory: express.Router = express.Router()
const toDtRouter: dt.Router = express.Router()
const fromOurRouter: dt.Router = ourRouter

void [fromDtRouter, fromFactory, toDtRouter, fromOurRouter]
void [asDtHandler, fromDtRequest, fromDtResponse, toDtRequest, toDtResponse, toDtApp, fromDtApp]

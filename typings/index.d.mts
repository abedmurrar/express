/*!
 * Public types for `import express from 'express'` and the named imports.
 * index.mjs re-exports the CommonJS build, so these are the types of
 * typings/index.d.ts, re-exported as an ES module.
 *
 * Ported from @types/express 5.0.6 and @types/express-serve-static-core 5.1.3
 * (DefinitelyTyped, MIT); see typings/index.d.ts for the credits and licence.
 */

import express = require('./index.js')

export default express

export import application = express.application
export import request = express.request
export import response = express.response
export import json = express.json
export import raw = express.raw
export import text = express.text
export import urlencoded = express.urlencoded
export import Route = express.Route
export import Router = express.Router

declare const serveStatic: typeof express.static
export { serveStatic as static }

export import Application = express.Application
export import BodyParserHandler = express.BodyParserHandler
export import CookieOptions = express.CookieOptions
export import DownloadOptions = express.DownloadOptions
export import Errback = express.Errback
export import ErrorRequestHandler = express.ErrorRequestHandler
export import Express = express.Express
export import Handler = express.Handler
export import IRoute = express.IRoute
export import IRouter = express.IRouter
export import IRouterHandler = express.IRouterHandler
export import IRouterMatcher = express.IRouterMatcher
export import Locals = express.Locals
export import MediaType = express.MediaType
export import NextFunction = express.NextFunction
export import Options = express.Options
export import OptionsJson = express.OptionsJson
export import OptionsText = express.OptionsText
export import OptionsUrlencoded = express.OptionsUrlencoded
export import ParamsDictionary = express.ParamsDictionary
export import ParamsFlatDictionary = express.ParamsFlatDictionary
export import PathParams = express.PathParams
export import Query = express.Query
export import Request = express.Request
export import RequestHandler = express.RequestHandler
export import RequestHandlerParams = express.RequestHandlerParams
export import RequestParamHandler = express.RequestParamHandler
export import Response = express.Response
export import RouteParameters = express.RouteParameters
export import RouterOptions = express.RouterOptions
export import Send = express.Send
export import SendFileOptions = express.SendFileOptions
export import ServeStaticConstructor = express.ServeStaticConstructor
export import ServeStaticHandler = express.ServeStaticHandler
export import ServeStaticOptions = express.ServeStaticOptions

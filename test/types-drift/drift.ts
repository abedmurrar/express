// Every difference between typings/ and src/, and between them and the members
// the running code has, with the reason it is there. compare.ts says what each
// kind means. tsc fails on a difference that isn't listed, and on one listed
// that is gone or is now of another kind, so fix the typings (or src) when that
// is the mistake, and list it here only when they differ on purpose.
//
// "As in @types/express" means that changing it would break code, or types,
// written for @types/express: existing code must compile unchanged, and our
// types and its types must stay assignable to each other (test/types/interop.ts).

import type { EventEmitter } from 'node:events'
import type { createReadStream } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type * as core from '../../typings/core.js'
import type express = require('../../typings/index.js')
import type { Application, ApplicationSettings } from '../../src/application'
import type { BodyParser, JsonOptions, RawOptions, TextOptions, UrlencodedOptions } from '../../src/body-parser'
import type { Request } from '../../src/request'
import type { CookieOptions, ExpressResponse, SendFileOptions } from '../../src/response'
import type { NextFunction, Router, RouterConstructor, RouterOptions } from '../../src/router'
import type { Layer } from '../../src/router/lib/layer'
import type { Route } from '../../src/router/lib/route'
import type { TraceContext } from '../../src/router/lib/tracing'
import type { SendOptions } from '../../src/send'
import type { ServeStaticFunction, ServeStaticOptions } from '../../src/serve-static'
import type { Differences, OptionDifferences, Signatures } from './compare'
import type * as Surface from './surface.json'

const rareMethod = 'not in typings: an HTTP method that @types/express leaves out too'
const bindMethod = 'not in typings: the BIND method; declaring it would replace the Function#bind a router type has'
const routeMethod = 'not in typings: a method IRoute leaves out, as in @types/express'
const privateMember = 'not in typings: private, though its name has no underscore'
const routerOption = "not in typings: the router's own copy of its option"
const express4 = 'only in typings: an Express 4 member, deprecated there, so code that mentions it compiles'
const byMiddleware = 'only in typings: set by cookie-parser'

/** What src/express.ts exports, which it assigns one by one. */
interface Module extends Pick<BodyParser, 'json' | 'raw' | 'text' | 'urlencoded'> {
  application: Application
  request: Request
  response: ExpressResponse
  Route: RouterConstructor['Route']
  Router: RouterConstructor
  static: ServeStaticFunction
}

export const exported: Differences<typeof express, Module, typeof Surface.express> = {}

/** The signatures of the types that are functions, and of `next`. */
interface PublicCalls {
  app: Signatures<core.Express>
  router: Signatures<core.RouterWithErrorHandlers>
  next: core.NextFunction
}
interface SrcCalls {
  app: Signatures<Application>
  router: Signatures<Router>
  next: NextFunction
}

export const calls: Differences<PublicCalls, SrcCalls, SrcCalls> = {}

export const request: Differences<core.Request, Request, typeof Surface.request, IncomingMessage> = {
  accepted: express4,
  accepts: 'other result: src has one signature for every call; the typings give each call its own result',
  body: 'not typed in src: set by the body parsers',
  cookies: byMiddleware,
  host: 'other type: undefined without a valid Host header, but a string as in @types/express',
  hostname: 'other type: undefined without a valid Host header, but a string as in @types/express',
  method: 'other type: a server request always has one, so the typings leave out undefined',
  originalRoute: 'not typed in src: defined in src/express.ts',
  params: 'other type: path-to-regexp types a parameter as possibly undefined; the typings take them from the route',
  path: "other type: parseurl's null is for a URL without a path, which a server request doesn't have",
  query: 'other type: an object of the query parser in use; the typings have the shape qs and node:querystring give',
  secret: 'not in typings: set by cookie-parser for res.cookie(), not for apps',
  signedCookies: byMiddleware
}

export const response: Differences<core.Response, ExpressResponse, typeof Surface.response, ServerResponse> = {
  append:
    'other parameters: the value is required (without one it sends "undefined"), but optional as in @types/express',
  charset: express4,
  get: "other result: Node's header values; the typings have string, as in @types/express",
  render: 'other parameters: the callback gets a null error or no html; it is given both as in @types/express'
}

export const application: Differences<core.Express, Application, typeof Surface.application, EventEmitter> = {
  _router: express4,
  acl: rareMethod,
  bind: bindMethod,
  cache: privateMember,
  engines: privateMember,
  handle: privateMember,
  map: express4,
  mkcalendar: rareMethod,
  mountpath: 'other type: a RegExp when mounted on one, but strings as in @types/express',
  parent: privateMember,
  rebind: rareMethod,
  render: 'other parameters: the callback gets a null error or no html; it is given both as in @types/express',
  resource: express4,
  route: "other result: the typings' route() takes the parameters from the path; src's Route has no type parameter",
  routes: express4,
  source: rareMethod,
  stack: 'only in typings: comes with IRouter; deprecated there, the stack is on app.router',
  unbind: rareMethod
}

export const router: Differences<core.RouterWithErrorHandlers, Router, typeof Surface.router> = {
  acl: rareMethod,
  bind: bindMethod,
  caseSensitive: routerOption,
  handle: privateMember,
  mergeParams: routerOption,
  mkcalendar: rareMethod,
  params: privateMember,
  rebind: rareMethod,
  route: "other result: the typings' route() takes the parameters from the path; src's Route has no type parameter",
  source: rareMethod,
  strict: routerOption,
  strictMount: routerOption,
  unbind: rareMethod
}

export const route: Differences<core.IRoute, Route, typeof Surface.route> = {
  acl: rareMethod,
  bind: rareMethod,
  connect: routeMethod,
  dispatch: privateMember,
  link: routeMethod,
  methods: privateMember,
  mkcalendar: rareMethod,
  path: 'other type: a RegExp or an array when registered with one, but a string as in @types/express',
  propfind: routeMethod,
  proppatch: routeMethod,
  query: routeMethod,
  rebind: rareMethod,
  source: rareMethod,
  unbind: rareMethod,
  unlink: routeMethod
}

export const layer: Differences<core.ILayer, Layer, typeof Surface.layer> = {
  handle: "other parameters: an error handler's layer has one of four arguments; the typings have a request handler",
  handleError: privateMember,
  handleRequest: privateMember,
  match: privateMember,
  matchers: privateMember,
  method: "other type: undefined for layers that aren't a route's, but a string as in @types/express",
  rawMatchers: privateMember,
  rawPath: privateMember,
  regexp: 'only in typings: an Express 4 member, deprecated there',
  slash: privateMember,
  traceError: privateMember,
  traceRequest: privateMember
}

export const traceContext: Differences<express.RouterTraceContext, TraceContext, TraceContext> = {}

export const routerOptions: OptionDifferences<express.RouterOptions, RouterOptions, typeof Surface.options.router> = {}

const nullLimit = 'narrower in typings: null is undocumented and means the default, as undefined does'
const verifyEncoding = 'other type: the encoding is null for express.raw(), but a string as in @types/express'

export const json: OptionDifferences<express.OptionsJson, JsonOptions, typeof Surface.options.json> = {
  limit: nullLimit,
  verify: verifyEncoding
}

export const raw: OptionDifferences<express.Options, RawOptions, typeof Surface.options.raw> = {
  defaultCharset: 'not in typings: read with the other options, then ignored: a raw body has no charset',
  limit: nullLimit,
  verify: verifyEncoding
}

export const text: OptionDifferences<express.OptionsText, TextOptions, typeof Surface.options.text> = {
  limit: nullLimit,
  verify: verifyEncoding
}

export const urlencoded: OptionDifferences<
  express.OptionsUrlencoded,
  UrlencodedOptions,
  typeof Surface.options.urlencoded
> = {
  limit: nullLimit,
  verify: verifyEncoding
}

/** What send passes on to `fs.createReadStream()`; its own `start` and `end` are compared. */
type ReadStreamOptions = Omit<Exclude<Parameters<typeof createReadStream>[1], string | undefined>, 'start' | 'end'>

const booleanList = 'other type: true throws (only false is an option), but a boolean as in @types/express'
const maxage = "not in typings: send's undocumented alias of maxAge"
const byteOffset = "not in typings: send's byte offsets would be the same for every file, so as in @types/express"
const headers = 'other type: unknown values, as in @types/express; Node turns them into strings'

export const staticOptions: OptionDifferences<
  express.ServeStaticOptions,
  ServeStaticOptions,
  typeof Surface.options.static,
  ReadStreamOptions
> = {
  dotfiles: 'other type: any other string throws, but a string as in @types/express',
  end: byteOffset,
  extensions:
    "narrower in typings: a string works, but allowing it would stop these fitting @types/serve-static's options",
  index: booleanList,
  maxage,
  root: "not in typings: send's option, which express.static() sets from its first argument",
  start: byteOffset
}

export const sendFile: OptionDifferences<
  core.SendFileOptions,
  SendOptions & SendFileOptions,
  typeof Surface.options.sendFile,
  ReadStreamOptions
> = {
  extensions: booleanList,
  headers,
  index: booleanList,
  maxage
}

export const download: OptionDifferences<
  core.DownloadOptions,
  SendOptions & SendFileOptions,
  typeof Surface.options.download,
  ReadStreamOptions
> = {
  extensions: booleanList,
  headers,
  index: booleanList,
  maxage
}

export const cookie: OptionDifferences<core.CookieOptions, CookieOptions, CookieOptions> = {
  expires:
    "narrower in typings: 0 (with maxAge, #5150) works, but allowing it would stop these fitting @types/express's options"
}

/**
 * The typings take any setting name. If they ever list the names, each one the
 * code sets or reads has to be among them.
 */
type App = core.Application
type SettingName = Parameters<App['set']>[0] &
  Parameters<App['enabled']>[0] &
  Parameters<App['disabled']>[0] &
  Parameters<App['enable']>[0] &
  Parameters<App['disable']>[0]
type UsedSetting = keyof typeof Surface.settings | keyof ApplicationSettings

export const settings: Record<Exclude<UsedSetting, SettingName>, string> = {}

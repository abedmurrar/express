/*!
 * router
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 *
 * Loaded with `require` and typed with `typeof import(...)`, so the compiled
 * output calls them directly, with no interop helpers in between.
 * @private
 */

const isPromise = require('is-promise') as typeof import('is-promise').default
const Layer = require('./lib/layer') as LayerConstructor
const { METHODS } = require('node:http') as typeof import('node:http')
const { Buffer } = require('node:buffer') as typeof import('node:buffer')
const parseUrl = require('parseurl') as typeof import('parseurl')
const Route = require('./lib/route') as RouteConstructor
const symbols = require('./lib/symbols') as typeof import('./lib/symbols')
const { checkPath, trackRoute } = require('./lib/warnings') as typeof import('./lib/warnings')
const { recordError, requestChannel, traceParam } = require('./lib/tracing') as typeof import('./lib/tracing')
const { matchedPattern } = require('./lib/original-route') as typeof import('./lib/original-route')
const { withCode } = require('../error-code') as typeof import('../error-code')
const mountMatch: typeof symbols.mountMatch = symbols.mountMatch
const routeMatch: typeof symbols.routeMatch = symbols.routeMatch
const matchedRoute: typeof symbols.matchedRoute = symbols.matchedRoute
const debug = (require('debug') as typeof import('debug'))('router')
const deprecate = (require('depd') as typeof import('depd'))('router')

import type {
  Layer as LayerInstance,
  LayerConstructor,
  LayerHandler,
  NextFunction,
  Params,
  PathParams,
  RouterRequest,
  RouterResponse
} from './lib/layer'
import type { HandlerList, HttpMethod, HttpMethods, Route as RouteInstance, RouteConstructor } from './lib/route'
import type { MatchedRequest, MatchRecord } from './lib/symbols'

export type {
  ErrorRequestHandler,
  LayerHandler,
  NextFunction,
  Params,
  PathParams,
  RequestHandler,
  RouterRequest,
  RouterResponse
} from './lib/layer'
export type { HandlerList, HttpMethod, HttpMethods, RouteMethod } from './lib/route'

export interface RouterOptions {
  caseSensitive?: boolean | undefined
  mergeParams?: boolean | undefined
  strict?: boolean | undefined
  strictMount?: boolean | undefined
}

/** `router.param()` callbacks: a middleware that is also given the parameter's value and name. */
export type ParamCallback = (
  req: RouterRequest,
  res: RouterResponse,
  next: NextFunction,
  value: string | string[],
  name: string
) => unknown

/** `router.get(path, handlers...)` and the other methods: adds a route, returns the router. */
export type RouterMethod = (path: PathParams, ...handlers: HandlerList[]) => Router

/** A router: a middleware function, with the routing methods on its prototype. */
export interface Router extends HttpMethods<RouterMethod> {
  (req: RouterRequest, res: RouterResponse, next: NextFunction): void
  caseSensitive: boolean | undefined
  mergeParams: boolean | undefined
  params: Record<string, ParamCallback[]>
  strict: boolean | undefined
  strictMount?: boolean | undefined
  stack: LayerInstance[]
  param(name: string, fn: ParamCallback): Router
  handle(req: RouterRequest, res: RouterResponse, callback: NextFunction): void
  use(handler: PathParams | HandlerList, ...handlers: HandlerList[]): Router
  error(handler: PathParams | HandlerList, ...handlers: HandlerList[]): Router
  route(path: PathParams): RouteInstance
  all: RouterMethod
}

/** The `Router` constructor, which also works without `new`, with `Route` on it. */
export interface RouterConstructor {
  new (options?: RouterOptions): Router
  (options?: RouterOptions): Router
  prototype: Router
  Route: RouteConstructor
}

/** What `router.param()` remembers per parameter name, within one request. */
interface ParamCalled {
  error: unknown
  match: string | string[]
  value: string | string[] | undefined
}

/**
 * Module variables.
 * @private
 */

const flatten = Array.prototype.flat
const methods = METHODS.map((method) => method.toLowerCase()) as Array<HttpMethod | 'all'>

/**
 * Not in upstream (router 2.2.0, 2.3.0). When a mount path takes the whole
 * pathname and the request has no slash after it (`GET /dir` on
 * `use('/dir', router)`), `req.url` would be empty, so the router adds a
 * leading slash. A strict router below then saw only "/", so a route for ""
 * could never match (expressjs/express#3798). This maps the request to the
 * exact `req.url` that adding the slash produced, while the mount is entered.
 * For that `req.url`, a strict router tries each route on "" before "/", so
 * `get('')` answers `/dir` and not `/dir/`. A route that matches "/" still
 * answers both, as before, unless the router has the `strictMount` option
 * (expressjs/express#2281): then each route is matched on "" only, so
 * `get('/')` answers `/dir/` and not `/dir`. Once something rewrites
 * `req.url`, it no longer equals the stored value and routes as it reads.
 * @private
 */

const addedSlashUrl = new WeakMap<RouterRequest, string>()

/**
 * Expose `Router`.
 */

module.exports = Router

/**
 * Expose `Route`.
 */

module.exports.Route = Route

/**
 * Initialize a new `Router` with the given `options`.
 *
 * @param {object} [options]
 * @return {Router} which is a callable function
 * @public
 */

function Router(this: Router, options?: RouterOptions): Router {
  if (!(this instanceof Router)) {
    return new (Router as RouterConstructor)(options)
  }

  const opts = options || {}

  function router(req: RouterRequest, res: RouterResponse, next: NextFunction) {
    ;(router as Router).handle(req, res, next)
  }

  // inherit from the correct prototype
  Object.setPrototypeOf(router, this)

  router.caseSensitive = opts.caseSensitive
  router.mergeParams = opts.mergeParams
  router.params = {}
  router.strict = opts.strict
  router.stack = [] as LayerInstance[]

  // Not in upstream (router 2.2.0, 2.3.0): opt-in, so a router that doesn't
  // ask for it keeps upstream's own properties (see addedSlashUrl)
  if (opts.strictMount === true) {
    router.strictMount = true
  }

  return router as Router
}

/**
 * Router prototype inherits from a Function.
 */

/* istanbul ignore next */
/* c8 ignore next: a function object only so routers inherit from Function; never called */
Router.prototype = function RouterPrototype() {}

/**
 * The prototype, typed (a function declaration's `prototype` is untyped).
 * @private
 */

const proto = Router.prototype as Router

/**
 * Map the given param placeholder `name`(s) to the given callback.
 *
 * Parameter mapping is used to provide pre-conditions to routes
 * which use normalized placeholders. For example a _:user_id_ parameter
 * could automatically load a user's information from the database without
 * any additional code.
 *
 * The callback uses the same signature as middleware, the only difference
 * being that the value of the placeholder is passed, in this case the _id_
 * of the user. Once the `next()` function is invoked, just like middleware
 * it will continue on to execute the route, or subsequent parameter functions.
 *
 * Just like in middleware, you must either respond to the request or call next
 * to avoid stalling the request.
 *
 *  router.param('user_id', function(req, res, next, id){
 *    User.find(id, function(err, user){
 *      if (err) {
 *        return next(err)
 *      } else if (!user) {
 *        return next(new Error('failed to load user'))
 *      }
 *      req.user = user
 *      next()
 *    })
 *  })
 *
 * @param {string} name
 * @param {function} fn
 * @public
 */

proto.param = function param(name, fn) {
  if (!name) {
    throw withCode(new TypeError('argument name is required'), 'EXPRESS_ERR_PARAM_NAME_REQUIRED')
  }

  if (typeof name !== 'string') {
    throw withCode(new TypeError('argument name must be a string'), 'EXPRESS_ERR_PARAM_NAME_NOT_STRING')
  }

  if (!fn) {
    throw withCode(new TypeError('argument fn is required'), 'EXPRESS_ERR_PARAM_CALLBACK_REQUIRED')
  }

  if (typeof fn !== 'function') {
    throw withCode(new TypeError('argument fn must be a function'), 'EXPRESS_ERR_PARAM_CALLBACK_NOT_FUNCTION')
  }

  let params = this.params[name]

  if (!params) {
    params = this.params[name] = []
  }

  params.push(fn)

  return this
}

/**
 * Dispatch a req, res into the router.
 *
 * @private
 */

proto.handle = function handleRequest(req, res, callback) {
  if (!callback) {
    throw withCode(new TypeError('argument callback is required'), 'EXPRESS_ERR_ROUTER_CALLBACK_REQUIRED')
  }

  // A request target never carries a fragment (RFC 9112 section 3.2), but
  // Node passes one through in req.url, and parseurl then falls back to
  // url.parse, which reads "//user@host/..." as a host and routes a path the
  // client never asked for. Not in upstream (router 2.2.0, 2.3.0): drop the
  // fragment once, in the outermost router (no originalUrl yet), so every
  // reader of req.url, req.originalUrl and req.path sees the same path.
  if (!req.originalUrl && typeof req.url === 'string') {
    const hash = req.url.indexOf('#')
    if (hash !== -1) {
      req.url = req.url.slice(0, hash)
    }
  }

  debug('dispatching %s %s', req.method, req.url)

  let entered: MatchRecord | undefined
  let idx = 0
  let methods: string[] | undefined
  const protohost = getProtohost(req.url) || ''
  let removed = ''
  const self = this
  let slashAdded = false
  let slashMarked = false
  let sync = 0
  const paramcalled: Record<string, ParamCalled> = {}

  // middleware and routes
  const stack = this.stack

  // manage inter-router variables
  const parentParams = req.params
  const parentUrl = req.baseUrl || ''
  let done = restore(callback, req, 'baseUrl', 'next', 'params')

  // Not in router 2.2.0 or 2.3.0: whether the tracing channel (lib/tracing)
  // has subscribers, checked once here rather than for every layer. Only a
  // traced router keeps the matched pattern, so only it restores it (2.3.0
  // always restores it, with baseUrl, next and params).
  // `var`, so the closures below read it without a temporal-dead-zone check
  var traced = requestChannel.hasSubscribers
  if (traced) done = restore(done, req as RouterRequest & MatchedRequest, matchedRoute)

  // setup next layer
  req.next = next

  // for options requests, respond with a default if nothing else responds
  if (req.method === 'OPTIONS') {
    methods = []
    done = wrap(done, generateOptionsResponder(res, methods))
  }

  // setup basic req values
  req.baseUrl = parentUrl
  req.originalUrl = req.originalUrl || req.url

  next()

  function next(err?: unknown): void | NodeJS.Immediate {
    let layerError = err === 'route' ? null : err

    // Router 2.3.0 (tracing): the error has already left its originating
    // callback. Remember it even when that callback was not traced, so
    // enclosing routers cannot claim it. Not in 2.3.0: only while the channel
    // has subscribers, so an untraced request gets nothing new.
    if (err && requestChannel.hasSubscribers) recordError(req, err)

    // remove added slash
    if (slashAdded) {
      req.url = req.url.slice(1)
      slashAdded = false
    }

    // forget the slash this router added (see addedSlashUrl)
    if (slashMarked) {
      addedSlashUrl.delete(req)
      slashMarked = false
    }

    // leave the mount this router entered (see trimPrefix)
    if (entered !== undefined) {
      ;(req as RouterRequest & MatchedRequest)[mountMatch] = entered.parent
      entered = undefined
    }

    // restore altered req.url
    if (removed.length !== 0) {
      req.baseUrl = parentUrl
      req.url = protohost + removed + req.url.slice(protohost.length)
      removed = ''
    }

    // signal to exit router
    if (layerError === 'router') {
      setImmediate(done, null)
      return
    }

    // no more matching layers
    if (idx >= stack.length) {
      setImmediate(done, layerError)
      return
    }

    // max sync stack
    if (++sync > 100) {
      return setImmediate(next, err)
    }

    // get pathname of request
    const path = getPathname(req)

    if (path == null) {
      return done(layerError)
    }

    // a strict router below a mount that had no slash after it (see addedSlashUrl)
    const noSlash = self.strict && addedSlashUrl.get(req) === req.url

    // find next matching layer
    let layer!: LayerInstance
    let match: unknown
    let route: RouteInstance | undefined

    while (match !== true && idx < stack.length) {
      layer = stack[idx++] as LayerInstance
      match =
        noSlash && layer.route !== undefined
          ? matchLayer(layer, '') === true || (self.strictMount !== true && matchLayer(layer, path))
          : matchLayer(layer, path)
      route = layer.route

      if (typeof match !== 'boolean') {
        // Router 2.3.0 (tracing): matching can fail before a handler runs (for
        // example, URI decoding). Forwarding that error must not attribute it
        // to a later handler. Only while traced, as above.
        if (requestChannel.hasSubscribers) recordError(req, match)

        // hold on to layerError
        layerError = layerError || match
      }

      if (match !== true) {
        continue
      }

      if (!route) {
        // process non-route handlers normally
        continue
      }

      if (layerError) {
        // routes do not match with a pending error
        match = false
        continue
      }

      const method = req.method
      const hasMethod = route._handlesMethod(method)

      // build up automatic options response
      if (!hasMethod && method === 'OPTIONS' && methods) {
        methods.push(...route._methods())
      }

      // don't even bother matching route
      if (!hasMethod && method !== 'HEAD') {
        match = false
      }
    }

    // no match
    if (match !== true) {
      return done(layerError)
    }

    // store route for dispatch on change
    if (route) {
      req.route = route

      // Not in upstream (router 2.2.0, 2.3.0): what req.originalRoute is built
      // from when it is read (lib/original-route), kept as long as req.route
      // is, with the mounts the request is in at this moment
      ;(req as RouterRequest & MatchedRequest)[routeMatch] = {
        layer,
        path,
        noSlash,
        parent: (req as RouterRequest & MatchedRequest)[mountMatch]
      }

      // Router 2.3.0 (tracing): the route's pattern, for its parameter
      // callbacks and handlers (see setMatchedRoute). Here, not in the
      // callback below, which would make noSlash a context variable that the
      // matching loop reads on every layer.
      if (traced) setMatchedRoute(req, layer, path, noSlash)
    }

    // Capture one-time layer values
    req.params = self.mergeParams ? mergeParams(layer.params as Params, parentParams) : (layer.params as Params)
    const layerPath = layer.path as string

    // this should be done for the layer
    processParams(self.params, layer, paramcalled, req, res, function (err) {
      if (err) {
        next(layerError || err)
      } else if (route) {
        // a route's own layer: route.dispatch traces its handlers
        layer.handleRequest(req, res, next)
      } else {
        trimPrefix(layer, layerError, layerPath, path)
      }

      sync = 0
    })
  }

  function trimPrefix(layer: LayerInstance, layerError: unknown, layerPath: string, path: string) {
    if (layerPath.length !== 0) {
      // Validate path is a prefix match
      if (layerPath !== path.substring(0, layerPath.length)) {
        next(layerError)
        return
      }

      // Validate path breaks on a path separator
      const c = path[layerPath.length]
      if (c && c !== '/') {
        next(layerError)
        return
      }

      // Trim off the part of the url that matches the route
      // middleware (.use stuff) needs to have the path stripped
      debug('trim prefix (%s) from url %s', layerPath, req.url)
      removed = layerPath
      req.url = protohost + req.url.slice(protohost.length + removed.length)

      // Ensure leading slash
      if (!protohost && req.url[0] !== '/') {
        req.url = '/' + req.url
        slashAdded = true

        // the request had no slash after the mount path (see addedSlashUrl)
        if (removed[removed.length - 1] !== '/') {
          addedSlashUrl.set(req, req.url)
          slashMarked = true
        }
      }

      // Setup base URL (no trailing slash)
      req.baseUrl =
        parentUrl + (removed[removed.length - 1] === '/' ? removed.substring(0, removed.length - 1) : removed)
    }

    // Not in upstream (router 2.2.0, 2.3.0): record the mount the request
    // enters, for req.originalRoute (see the route record in next()), until
    // it comes back to next(). A "/" mount adds nothing to the route.
    if (!layer.slash) {
      entered = { layer, path, noSlash: false, parent: (req as RouterRequest & MatchedRequest)[mountMatch] }
      ;(req as RouterRequest & MatchedRequest)[mountMatch] = entered
    }

    debug('%s %s : %s', layer.name, layerPath, req.originalUrl)

    // Not in router 2.2.0 or 2.3.0: traced, the layer's tracing methods run
    // it, with its pattern (see setMatchedRoute)
    if (traced) {
      setMatchedRoute(req, layer, path, false)
      if (layerError) layer.traceError(layerError, req, res, next)
      else layer.traceRequest(req, res, next)
    } else if (layerError) {
      layer.handleError(layerError, req, res, next)
    } else {
      layer.handleRequest(req, res, next)
    }
  }
}

/**
 * Use the given middleware function, with optional path, defaulting to "/".
 *
 * Use (like `.all`) will run for any http METHOD, but it will not add
 * handlers for those methods so OPTIONS requests will not consider `.use`
 * functions even if they could respond.
 *
 * The other difference is that _route_ path is stripped and not visible
 * to the handler function. The main effect of this feature is that mounted
 * handlers can operate without any code changes regardless of the "prefix"
 * pathname.
 *
 * @public
 */

proto.use = function use(handler, ...rest) {
  let offset = 0
  let path: PathParams = '/'

  // default path to '/'
  // disambiguate router.use([handler])
  if (typeof handler !== 'function') {
    let arg: unknown = handler

    while (Array.isArray(arg) && arg.length !== 0) {
      arg = arg[0]
    }

    // first arg is the path
    if (typeof arg !== 'function') {
      offset = 1
      path = handler as PathParams
    }
  }

  const args: unknown[] = offset === 0 ? [handler, ...rest] : rest
  const callbacks: unknown[] = flatten.call(args, Infinity)

  if (callbacks.length === 0) {
    throw withCode(new TypeError('argument handler is required'), 'EXPRESS_ERR_HANDLER_REQUIRED')
  }

  for (let i = 0; i < callbacks.length; i++) {
    const fn = callbacks[i]

    if (typeof fn !== 'function') {
      throw withCode(new TypeError('argument handler must be a function'), 'EXPRESS_ERR_HANDLER_NOT_FUNCTION')
    }

    // Not in upstream (router 2.2.0, 2.3.0): a router mounted at "/" on
    // itself, directly or through routers mounted at "/", sends every request
    // it doesn't answer round forever. Mounts at other paths consume a part
    // of the path on each pass, so those cycles end and still work.
    if (path === '/' && fn instanceof Router && mountsAtRoot(fn as Router, this, new Set())) {
      throw withCode(
        new TypeError('argument handler would mount this router on itself at "/", which loops forever'),
        'EXPRESS_ERR_ROUTER_MOUNTS_ITSELF'
      )
    }

    // add the middleware
    debug('use %o %s', path, fn.name || '<anonymous>')

    const layer = new Layer(
      path,
      {
        sensitive: this.caseSensitive,
        strict: false,
        end: false
      },
      fn as LayerHandler
    )

    layer.route = undefined

    this.stack.push(layer)
  }

  // Not in upstream (router 2.2.0, 2.3.0): warn about a path no request can
  // match (lib/warnings), on the express:router debug namespace
  checkPath(path, 'use')

  return this
}

/**
 * Not in upstream (router 2.2.0, 2.3.0): use() for error handlers
 * (expressjs/express#2896; pillarjs/router#59 proposed it). The arguments are
 * use()'s, and each function is mounted as use() mounts it, but runs only for
 * an error, whatever its length, so a wrapped, bound or compiled handler whose
 * length isn't 4 still works. A router or an app can't take the error, so it
 * is refused.
 *
 * @public
 */

proto.error = function error(handler, ...rest) {
  const start = this.stack.length

  this.use(handler, ...rest)

  for (let i = start; i < this.stack.length; i++) {
    const layer = this.stack[i] as LayerInstance

    if (typeof (layer.handle as { handle?: unknown }).handle === 'function') {
      this.stack.length = start
      throw withCode(
        new TypeError('argument handler must be an error handler, not a router or an app'),
        'EXPRESS_ERR_ERROR_HANDLER_IS_ROUTER'
      )
    }

    layer.errorOnly = true
  }

  return this
}

/**
 * Create a new Route for the given path.
 *
 * Each route contains a separate middleware stack and VERB handlers.
 *
 * See the Route api documentation for details on adding handlers
 * and middleware to routes.
 *
 * @param {string} path
 * @return {Route}
 * @public
 */

proto.route = function route(path) {
  const route = new Route(path)

  const layer = new Layer(
    path,
    {
      sensitive: this.caseSensitive,
      strict: this.strict,
      end: true
    },
    handle
  )

  function handle(req: RouterRequest, res: RouterResponse, next: NextFunction) {
    route.dispatch(req, res, next)
  }

  layer.route = route

  this.stack.push(layer)

  // Not in upstream (router 2.2.0, 2.3.0): the express:router warnings
  // (lib/warnings) about a path no request can match and duplicate routes
  checkPath(path, 'route')
  trackRoute(this, route, this.stack.length - 1)

  return route
}

// create Router#VERB functions
methods.concat('all').forEach(function (method) {
  proto[method] = function (path, ...handlers) {
    const route = this.route(path)
    route[method].apply(route, handlers)
    return this
  }
})

/**
 * Generate a callback that will make an OPTIONS response.
 *
 * @param {OutgoingMessage} res
 * @param {array} methods
 * @private
 */

function generateOptionsResponder(res: RouterResponse, methods: string[]) {
  return function onDone(fn: NextFunction, err?: unknown) {
    if (err || methods.length === 0) {
      return fn(err)
    }

    trySendOptionsResponse(res, methods, fn)
  }
}

/**
 * Get pathname of request.
 *
 * @param {IncomingMessage} req
 * @private
 */

function getPathname(req: RouterRequest) {
  try {
    return (parseUrl(req) as import('node:url').Url).pathname
  } catch {
    return undefined
  }
}

/**
 * Get get protocol + host for a URL.
 *
 * @param {string} url
 * @private
 */

function getProtohost(url: string) {
  if (typeof url !== 'string' || url.length === 0 || url[0] === '/') {
    return undefined
  }

  const searchIndex = url.indexOf('?')
  const pathLength = searchIndex !== -1 ? searchIndex : url.length
  const fqdnIndex = url.substring(0, pathLength).indexOf('://')

  return fqdnIndex !== -1 ? url.substring(0, url.indexOf('/', 3 + fqdnIndex)) : undefined
}

/**
 * Match path to a layer.
 *
 * @param {Layer} layer
 * @param {string} path
 * @private
 */

function matchLayer(layer: LayerInstance, path: string): unknown {
  try {
    return layer.match(path)
  } catch (err) {
    return err
  }
}

/**
 * Router 2.3.0's `req[matchedRoute] = match.pattern` (tracing): the pattern
 * the layer matched with, which the tracing context reports as `route`. Not
 * in 2.3.0: set only while traced, right before the layer's parameter
 * callbacks or handler run (2.3.0 sets it in next() for every matched layer),
 * and taken from `rawPath`, since match() returns true here, not a match
 * object (pillarjs/router#216).
 *
 * @private
 */

function setMatchedRoute(req: RouterRequest, layer: LayerInstance, path: string, noSlash: boolean | undefined) {
  ;(req as RouterRequest & MatchedRequest)[matchedRoute] = Array.isArray(layer.rawPath)
    ? matchedPattern(layer, path, noSlash)
    : layer.rawPath
}

/**
 * Merge params with parent params
 *
 * @private
 */

function mergeParams(params: Params, parent: Params | undefined): Params {
  if (typeof parent !== 'object' || !parent) {
    return params
  }

  // make copy of parent for base
  const obj = Object.assign({}, parent)

  // simple non-numeric merging
  if (!(0 in params) || !(0 in parent)) {
    return Object.assign(obj, params)
  }

  let i = 0
  let o = 0

  // determine numeric gap in params
  while (i in params) {
    i++
  }

  // determine numeric gap in parent
  while (o in parent) {
    o++
  }

  // offset numeric indices in params before merge
  for (i--; i >= 0; i--) {
    params[i + o] = params[i]

    // create holes for the merge when necessary
    if (i < o) {
      delete params[i]
    }
  }

  return Object.assign(obj, params)
}

/**
 * Whether `router` is `target`, or mounts it through routers mounted at "/".
 * Not in upstream (router 2.2.0, 2.3.0). Runs when a router is mounted,
 * never per request; `seen` stops it at a router it has already walked.
 *
 * @private
 */

function mountsAtRoot(router: Router, target: Router, seen: Set<Router>): boolean {
  if (router === target) {
    return true
  }

  if (seen.has(router)) {
    return false
  }

  seen.add(router)

  for (let i = 0; i < router.stack.length; i++) {
    const layer = router.stack[i] as LayerInstance
    if (layer.slash && layer.handle instanceof Router && mountsAtRoot(layer.handle as Router, target, seen)) {
      return true
    }
  }

  return false
}

/**
 * Process any parameters for the layer.
 *
 * @private
 */

function processParams(
  params: Record<string, ParamCallback[]>,
  layer: LayerInstance,
  called: Record<string, ParamCalled>,
  req: RouterRequest,
  res: RouterResponse,
  done: NextFunction
) {
  // captured parameters from the layer, keys and values
  const keys = layer.keys

  // fast track
  if (!keys || keys.length === 0) {
    return done()
  }

  // typed as set: nextParam checks them before paramCallback reads them
  let i = 0
  let paramIndex = 0
  let key: string
  let paramVal: string | string[]
  let paramCallbacks: ParamCallback[]
  let paramCalled: ParamCalled

  // process params in order
  // param callbacks can be async
  function nextParam(err?: unknown): void {
    if (err) {
      return done(err)
    }

    if (i >= keys.length) {
      return done()
    }

    paramIndex = 0
    key = keys[i++] as string
    paramVal = req.params[key] as string | string[]
    paramCallbacks = params[key] as ParamCallback[]
    paramCalled = called[key] as ParamCalled

    if (paramVal === undefined || !paramCallbacks) {
      return nextParam()
    }

    // param previously called with same value or error occurred
    if (paramCalled && (paramCalled.match === paramVal || (paramCalled.error && paramCalled.error !== 'route'))) {
      // restore value
      req.params[key] = paramCalled.value

      // next param
      return nextParam(paramCalled.error)
    }

    called[key] = paramCalled = {
      error: null,
      match: paramVal,
      value: paramVal
    }

    paramCallback()
  }

  // single param callbacks
  function paramCallback(err?: unknown) {
    const fn = paramCallbacks[paramIndex++]

    // store updated value
    paramCalled.value = req.params[key]

    if (err) {
      // store error
      paramCalled.error = err
      nextParam(err)
      return
    }

    if (!fn) return nextParam()

    // Not in router 2.2.0: router 2.3.0's tracing (lib/tracing), only while
    // the channel has subscribers
    if (requestChannel.hasSubscribers) {
      // the pattern of the layer whose parameter it is (the path of a route's
      // "" entry has no parameters, so noSlash can't apply)
      setMatchedRoute(req, layer, getPathname(req) as string, false)
      traceParam(
        fn,
        {
          req,
          res,
          layer,
          handler: fn,
          route: (req as RouterRequest & MatchedRequest)[matchedRoute],
          param: key
        },
        paramCallback,
        paramVal,
        key
      )
      return
    }

    try {
      const ret = fn(req, res, paramCallback, paramVal, key)
      if (isPromise(ret)) {
        if (!(ret instanceof Promise)) {
          deprecate('parameters that are Promise-like are deprecated, use a native Promise instead')
        }

        ret.then(null, function (error: unknown) {
          paramCallback(error || withCode(new Error('Rejected promise'), 'EXPRESS_ERR_REJECTED_PROMISE'))
        })
      }
    } catch (e) {
      paramCallback(e)
    }
  }

  nextParam()
}

/**
 * Restore obj props after function
 *
 * @private
 */

function restore<T extends object, K extends keyof T>(fn: NextFunction, obj: T, ...props: K[]): NextFunction
function restore<T extends object, K extends keyof T>(fn: Function, obj: T, ...props: K[]): Function {
  const vals = new Array<T[K]>(props.length)

  for (let i = 0; i < props.length; i++) {
    vals[i] = obj[props[i] as K]
  }

  return function (this: unknown): unknown {
    // restore vals
    for (let i = 0; i < props.length; i++) {
      obj[props[i] as K] = vals[i] as T[K]
    }

    return fn.apply(this, arguments)
  }
}

/**
 * Send an OPTIONS response.
 *
 * @private
 */

function sendOptionsResponse(res: RouterResponse, methods: string[]) {
  const options: Record<string, boolean> = Object.create(null)

  // build unique method map
  for (let i = 0; i < methods.length; i++) {
    options[methods[i] as string] = true
  }

  // construct the allow list
  const allow = Object.keys(options).sort().join(', ')

  // send response
  res.setHeader('Allow', allow)
  res.setHeader('Content-Length', Buffer.byteLength(allow))
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(allow)
}

/**
 * Try to send an OPTIONS response.
 *
 * @private
 */

function trySendOptionsResponse(res: RouterResponse, methods: string[], next: NextFunction) {
  try {
    sendOptionsResponse(res, methods)
  } catch (err) {
    next(err)
  }
}

/**
 * Wrap a function
 *
 * @private
 */

function wrap(old: NextFunction, fn: Function): NextFunction {
  return function proxy(this: unknown, ...args: unknown[]) {
    fn.call(this, old, ...args)
  }
}

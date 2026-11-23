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
const pathRegexp = require('path-to-regexp') as typeof import('path-to-regexp')
const debug = (require('debug') as typeof import('debug'))('router:layer')
const deprecate = (require('depd') as typeof import('depd'))('router')
const { withCode } = require('../../error-code') as typeof import('../../error-code')
const symbols = require('./symbols') as typeof import('./symbols')
const { publishEnd, recordThrown, requestChannel, traceAsyncEnd, wrapNext } =
  require('./tracing') as typeof import('./tracing')
const matchedRoute: typeof symbols.matchedRoute = symbols.matchedRoute

import type { MatchFunction, MatchOptions, ParamData } from 'path-to-regexp'
import type { Request } from '../../request'
import type { ExpressResponse } from '../../response'
import type { Route } from './route'
import type { MatchedRequest } from './symbols'
import type { TraceContext } from './tracing'

/** Call it to pass control on, or with an error (or `'route'`, `'router'`) to skip ahead. */
export type NextFunction = (err?: unknown) => void
export type Params = ParamData
export type PathParams = string | RegExp | Array<string | RegExp>

/**
 * The request: the Express request, which declares what the router reads and
 * sets on it (`url`, `baseUrl`, `originalUrl`, `params`, `route`, `next`).
 */
export type RouterRequest = Request

/** The response, which the router writes to only for the automatic OPTIONS response. */
export type RouterResponse = ExpressResponse

export type RequestHandler = (req: RouterRequest, res: RouterResponse, next: NextFunction) => unknown
/** Told apart from a request handler by taking four arguments. */
export type ErrorRequestHandler = (err: unknown, req: RouterRequest, res: RouterResponse, next: NextFunction) => unknown
export type LayerHandler = RequestHandler | ErrorRequestHandler

export interface LayerOptions {
  sensitive?: boolean | undefined
  strict?: boolean | undefined
  end?: boolean | undefined
}

export interface Layer {
  handle: LayerHandler
  keys: string[]
  name: string
  params: Params | undefined
  path: string | undefined
  slash: boolean
  matchers: Array<MatchFunction<Params>>
  rawPath: string | RegExp | Array<string | RegExp> // the path it was registered with, arrays flattened
  rawMatchers: Array<MatchFunction<Params>> // one per rawPath entry
  method?: string | undefined // set by the route
  route?: Route | undefined // set by the router
  errorOnly: boolean // registered with error(): an error handler whatever its length (false on the prototype)
  handleError(error: unknown, req: RouterRequest, res: RouterResponse, next: NextFunction): void
  handleRequest(req: RouterRequest, res: RouterResponse, next: NextFunction): void
  traceError(error: unknown, req: RouterRequest, res: RouterResponse, next: NextFunction): void
  traceRequest(req: RouterRequest, res: RouterResponse, next: NextFunction): void
  match(path: string | null | undefined): boolean
}

export interface LayerConstructor {
  new (path: PathParams, options: LayerOptions | undefined, fn: LayerHandler): Layer
  (path: PathParams, options: LayerOptions | undefined, fn: LayerHandler): Layer
  prototype: Layer
}

/**
 * Module variables.
 * @private
 */

const TRAILING_SLASH_REGEXP = /\/+$/
const MATCHING_GROUP_REGEXP = /\((?:\?<(.*?)>)?(?!\?)/g

/**
 * Expose `Layer`.
 */

module.exports = Layer

function Layer(this: Layer, path: PathParams, options: LayerOptions | undefined, fn: LayerHandler): Layer | void {
  if (!(this instanceof Layer)) {
    return new (Layer as LayerConstructor)(path, options, fn)
  }

  debug('new %o', path)
  const opts = options || {}

  this.handle = fn
  this.keys = []
  this.name = fn.name || '<anonymous>'
  this.params = undefined
  this.path = undefined
  this.slash = path === '/' && opts.end === false

  function matcher(_path: string | RegExp): MatchFunction<Params> {
    if (_path instanceof RegExp) {
      const keys: Array<{ name: string | number; offset: number }> = []
      let name = 0
      let m: RegExpExecArray | null
      // eslint-disable-next-line no-cond-assign
      while ((m = MATCHING_GROUP_REGEXP.exec(_path.source))) {
        keys.push({
          name: m[1] || name++,
          offset: m.index
        })
      }

      // A RegExp with the g or y flag keeps state in lastIndex between calls,
      // so the next request would be matched from where the last match ended
      // and fail: a guard like app.use(/^\/admin/g, auth) was skipped on every
      // other request. Not in upstream (router 2.2.0): start every match at 0,
      // as on the first request, which keeps each flag's meaning (y stays
      // anchored at the start).
      const stateful = _path.global || _path.sticky

      return function regexpMatcher(p) {
        if (stateful) _path.lastIndex = 0
        const match = _path.exec(p)
        if (!match) {
          return false
        }

        const params: Params = {}
        for (let i = 1; i < match.length; i++) {
          const key = keys[i - 1] as { name: string | number }
          const prop = key.name
          const val = decodeParam(match[i])

          if (val !== undefined) {
            params[prop] = val
          }
        }

        return {
          params,
          path: match[0]
        }
      }
    }

    return pathRegexp.match(opts.strict ? _path : loosen(_path), {
      sensitive: opts.sensitive,
      end: opts.end,
      trailing: !opts.strict,
      decode: decodeParam
    } as MatchOptions)
  }
  this.matchers = Array.isArray(path) ? path.map(matcher) : [matcher(path)]

  // Not in router 2.2.0: the path as registered, which req.originalRoute
  // reads. rawPath is router 2.3.0's (pillarjs/router#174), with its comment:
  // flat unnests nested path arrays and snapshots the caller's array.
  // rawMatchers has one matcher per rawPath entry, so the entry that matched
  // can be told apart; it's the same array as matchers unless the path nests
  // arrays (2.3.0 builds matchers from rawPath, so they are always the same).
  this.rawPath = Array.isArray(path) ? (path.flat(Infinity) as Array<string | RegExp>) : path
  this.rawMatchers =
    Array.isArray(path) && path.some(Array.isArray)
      ? (this.rawPath as Array<string | RegExp>).map(matcher)
      : this.matchers
}

/**
 * The prototype, typed (a function declaration's `prototype` is untyped).
 * @private
 */

const proto = Layer.prototype as Layer

// Not in upstream (router 2.2.0, 2.3.0): router.error() (and app.error())
// set it on their layers, which then handle errors only, whatever their
// handler's length. Other layers read this default.
proto.errorOnly = false

/**
 * Handle the error for the layer.
 *
 * @param {Error} error
 * @param {Request} req
 * @param {Response} res
 * @param {function} next
 * @api private
 */

proto.handleError = function handleError(error, req, res, next) {
  const fn = this.handle as ErrorRequestHandler

  if (fn.length !== 4 && !this.errorOnly) {
    // not a standard error handler
    return next(error)
  }

  try {
    // invoke function
    const ret = fn(error, req, res, next)

    // wait for returned promise
    if (isPromise(ret)) {
      if (!(ret instanceof Promise)) {
        deprecate('handlers that are Promise-like are deprecated, use a native Promise instead')
      }

      ret.then(null, function (error: unknown) {
        next(error || withCode(new Error('Rejected promise'), 'EXPRESS_ERR_REJECTED_PROMISE'))
      })
    }
  } catch (err) {
    next(err)
  }
}

/**
 * Handle the request for the layer.
 *
 * @param {Request} req
 * @param {Response} res
 * @param {function} next
 * @api private
 */

proto.handleRequest = function handleRequest(req, res, next) {
  const fn = this.handle as RequestHandler

  if (fn.length > 3 || this.errorOnly) {
    // not a standard request handler
    return next()
  }

  try {
    // invoke function
    const ret = fn(req, res, next)

    // wait for returned promise
    if (isPromise(ret)) {
      if (!(ret instanceof Promise)) {
        deprecate('handlers that are Promise-like are deprecated, use a native Promise instead')
      }

      ret.then(null, function (error: unknown) {
        next(error || withCode(new Error('Rejected promise'), 'EXPRESS_ERR_REJECTED_PROMISE'))
      })
    }
  } catch (err) {
    next(err)
  }
}

/**
 * Not in router 2.2.0: handleError and handleRequest traced through router
 * 2.3.0's request TracingChannel (lib/tracing). The router and the route call
 * these instead when the channel has subscribers, which they check once as
 * they start on a request. Router 2.3.0 has the traced path inside
 * handleError and handleRequest, behind a subscriber check before every
 * handler; here those two stay as in 2.2.0. A route's own layer only calls
 * route.dispatch, which traces the route's handlers one by one, so the router
 * always calls its handleRequest, never traceRequest.
 *
 * @api private
 */

proto.traceError = function traceError(error, req, res, next) {
  const fn = this.handle as ErrorRequestHandler

  if (fn.length !== 4) {
    // not a standard error handler
    return next(error)
  }

  invokeWithTrace(
    function invokeErrorHandler(wrappedNext) {
      return fn(error, req, res, wrappedNext)
    },
    {
      req,
      res,
      incomingError: error,
      layer: this,
      handler: fn,
      route: (req as RouterRequest & MatchedRequest)[matchedRoute],
      errorHandler: true
    },
    next
  )
}

proto.traceRequest = function traceRequest(req, res, next) {
  const fn = this.handle as RequestHandler

  if (fn.length > 3) {
    // not a standard request handler
    return next()
  }

  invokeWithTrace(
    function invokeHandler(wrappedNext) {
      return fn(req, res, wrappedNext)
    },
    {
      req,
      res,
      layer: this,
      handler: fn,
      route: (req as RouterRequest & MatchedRequest)[matchedRoute]
    },
    next
  )
}

/**
 * Invoke a handler wrapped in the request TracingChannel. Only called when the
 * channel has subscribers, so ctx is always present. Router 2.3.0's, with the
 * promise check written out as in the untraced path above (2.3.0 moved it to
 * a `handlePromise` helper that both paths share).
 * @private
 */

function invokeWithTrace(exec: (next: NextFunction) => unknown, ctx: TraceContext, next: NextFunction): void {
  const wrappedNext = wrapNext(ctx, next)
  let settled = false

  // runStores fires `start` and sets the async context. Synchronous layers
  // emit only start/end. All outcomes flow through wrappedNext to keep signal
  // filtering and dedup in one place.
  requestChannel.start.runStores(ctx, function () {
    let out: PromiseLike<unknown> | undefined
    try {
      const ret = exec(wrappedNext)
      if (isPromise(ret)) {
        if (!(ret instanceof Promise)) {
          deprecate('handlers that are Promise-like are deprecated, use a native Promise instead')
        }
        out = ret
      } else {
        // Same as tracePromise, a promise only gets its result once it resolves
        ctx.result = ret
      }
    } catch (err) {
      // A sync throw is forwarded verbatim, so a falsy value keeps routing
      // exactly as the untraced path does.
      wrappedNext(err)
      recordThrown(ctx, err, true)
      publishEnd(ctx, false)
      return
    }

    publishEnd(ctx, out !== undefined)
    if (out === undefined) return

    try {
      out.then(
        function (value) {
          // Same as tracePromise, only the first outcome settles the trace
          if (settled) return
          settled = true
          ctx.result = value
          traceAsyncEnd(ctx)
        },
        function (err: unknown) {
          // A rejected promise is an error even when the reason is falsy;
          // normalize it to the error the router forwards to next().
          rejected(err || withCode(new Error('Rejected promise'), 'EXPRESS_ERR_REJECTED_PROMISE'))
        }
      )
    } catch (err) {
      // Same as tracePromise, a `then` that throws is a rejection, forwarded
      // verbatim as the untraced path does
      rejected(err)
    }
  })

  function rejected(err: unknown) {
    // Routing still gets every outcome, as the untraced path does
    wrappedNext(err)
    if (settled) return
    settled = true
    recordThrown(ctx, err, false)
    traceAsyncEnd(ctx)
  }
}

/**
 * Check if this route matches `path`, if so
 * populate `.params`.
 *
 * @param {String} path
 * @return {Boolean}
 * @api private
 */

proto.match = function match(path) {
  let match: ReturnType<MatchFunction<Params>> | undefined

  if (path != null) {
    // fast path non-ending match for / (any path matches)
    if (this.slash) {
      this.params = {}
      this.path = ''
      return true
    }

    let i = 0
    while (!match && i < this.matchers.length) {
      // match the path
      match = (this.matchers[i] as MatchFunction<Params>)(path)
      i++
    }
  }

  if (!match) {
    this.params = undefined
    this.path = undefined
    return false
  }

  // store values
  this.params = match.params
  this.path = match.path
  this.keys = Object.keys(match.params)

  return true
}

/**
 * Decode param value.
 *
 * @param {string} val
 * @return {string}
 * @private
 */

function decodeParam(val: string): string
function decodeParam(val: string | undefined): string | undefined
function decodeParam(val: string | undefined): string | undefined {
  if (typeof val !== 'string' || val.length === 0) {
    return val
  }

  try {
    return decodeURIComponent(val)
  } catch (err) {
    if (err instanceof URIError) {
      err.message = "Failed to decode param '" + val + "'"
      ;(err as URIError & { status: number }).status = 400
      withCode(err, 'EXPRESS_ERR_PARAM_DECODE_FAILED')
    }

    throw err
  }
}

/**
 * Loosens the given path for path-to-regexp matching.
 */
function loosen(path: string): string
function loosen(path: string | RegExp): string | RegExp
function loosen(path: PathParams): PathParams {
  if (path instanceof RegExp || path === '/') {
    return path
  }

  if (Array.isArray(path)) {
    return path.map(function (p) {
      return loosen(p)
    })
  }

  const str = String(path)
  const loose = str.replace(TRAILING_SLASH_REGEXP, '')

  // Preserve paths that consist entirely of slashes (e.g. '//')
  // to prevent them from being reduced to an empty string,
  // which would incorrectly match all paths.
  return loose || str
}

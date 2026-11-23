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

const debug = (require('debug') as typeof import('debug'))('router:route')
const Layer = require('./layer') as LayerConstructor
const { METHODS } = require('node:http') as typeof import('node:http')
const { methodAdded } = require('./warnings') as typeof import('./warnings')
const { withCode } = require('../../error-code') as typeof import('../../error-code')
const { requestChannel } = require('./tracing') as typeof import('./tracing')

import type {
  Layer as LayerInstance,
  LayerConstructor,
  LayerHandler,
  NextFunction,
  PathParams,
  RouterRequest,
  RouterResponse
} from './layer'

/** The HTTP methods, in lower case, as Node lists them. */
export type HttpMethod =
  | 'acl'
  | 'bind'
  | 'checkout'
  | 'connect'
  | 'copy'
  | 'delete'
  | 'get'
  | 'head'
  | 'link'
  | 'lock'
  | 'm-search'
  | 'merge'
  | 'mkactivity'
  | 'mkcalendar'
  | 'mkcol'
  | 'move'
  | 'notify'
  | 'options'
  | 'patch'
  | 'post'
  | 'propfind'
  | 'proppatch'
  | 'purge'
  | 'put'
  | 'query'
  | 'rebind'
  | 'report'
  | 'search'
  | 'source'
  | 'subscribe'
  | 'trace'
  | 'unbind'
  | 'unlink'
  | 'unlock'
  | 'unsubscribe'

/** One property per HTTP method, each of type `M`. */
export type HttpMethods<M> = { [method in HttpMethod]: M }

/** Handlers, or arrays of them nested to any depth. */
export type HandlerList = LayerHandler | HandlerList[]

/** `route.get(handlers...)` and the other methods: adds handlers, returns the route. */
export type RouteMethod = (...handlers: HandlerList[]) => Route

export interface Route extends HttpMethods<RouteMethod> {
  path: PathParams
  stack: LayerInstance[]
  methods: Record<string, boolean> // route handlers for various http methods
  _handlesMethod(method: string | undefined): boolean
  _methods(): string[]
  dispatch(req: RouterRequest, res: RouterResponse, done: NextFunction): void
  all: RouteMethod
}

export interface RouteConstructor {
  new (path: PathParams): Route
  prototype: Route
}

/**
 * Module variables.
 * @private
 */

const slice = Array.prototype.slice
const flatten = Array.prototype.flat
const methods = METHODS.map((method) => method.toLowerCase()) as HttpMethod[]

/**
 * Expose `Route`.
 */

module.exports = Route

/**
 * Initialize `Route` with the given `path`,
 *
 * @param {String} path
 * @api private
 */

function Route(this: Route, path: PathParams) {
  debug('new %o', path)
  this.path = path
  this.stack = []

  // route handlers for various http methods
  this.methods = Object.create(null)
}

/**
 * The prototype, typed (a function declaration's `prototype` is untyped).
 * @private
 */

const proto = Route.prototype as Route

/**
 * @private
 */

proto._handlesMethod = function _handlesMethod(method) {
  if (this.methods._all) {
    return true
  }

  // normalize name
  let name = typeof method === 'string' ? method.toLowerCase() : method

  if (name === 'head' && !this.methods.head) {
    name = 'get'
  }

  return Boolean(this.methods[name as string])
}

/**
 * @return {array} supported HTTP methods
 * @private
 */

proto._methods = function _methods() {
  const methods = Object.keys(this.methods)

  // append automatic head
  if (this.methods.get && !this.methods.head) {
    methods.push('head')
  }

  for (let i = 0; i < methods.length; i++) {
    // make upper case
    methods[i] = (methods[i] as string).toUpperCase()
  }

  return methods
}

/**
 * dispatch req, res into this route
 *
 * @private
 */

proto.dispatch = function dispatch(req, res, done) {
  let idx = 0
  const stack = this.stack
  let sync = 0

  if (stack.length === 0) {
    return done()
  }

  let method = typeof req.method === 'string' ? req.method.toLowerCase() : req.method

  if (method === 'head' && !this.methods.head) {
    method = 'get'
  }

  req.route = this

  // Not in router 2.2.0 or 2.3.0: whether the tracing channel (./tracing) has
  // subscribers, checked once per dispatch, which picks each layer's traced
  // or untraced method
  const traced = requestChannel.hasSubscribers

  next()

  function next(err?: unknown): void | NodeJS.Immediate {
    // signal to exit route
    if (err && err === 'route') {
      return done()
    }

    // signal to exit router
    if (err && err === 'router') {
      return done(err)
    }

    // no more matching layers
    if (idx >= stack.length) {
      return done(err)
    }

    // max sync stack
    if (++sync > 100) {
      return setImmediate(next, err)
    }

    let layer!: LayerInstance
    let match: boolean | undefined

    // find next matching layer
    while (match !== true && idx < stack.length) {
      layer = stack[idx++] as LayerInstance
      match = !layer.method || layer.method === method
    }

    // no match
    if (match !== true) {
      return done(err)
    }

    if (err) {
      if (traced) layer.traceError(err, req, res, next)
      else layer.handleError(err, req, res, next)
    } else if (traced) {
      layer.traceRequest(req, res, next)
    } else {
      layer.handleRequest(req, res, next)
    }

    sync = 0
  }
}

/**
 * Add a handler for all HTTP verbs to this route.
 *
 * Behaves just like middleware and can respond or call `next`
 * to continue processing.
 *
 * You can use multiple `.all` call to add multiple handlers.
 *
 *   function check_something(req, res, next){
 *     next()
 *   }
 *
 *   function validate_user(req, res, next){
 *     next()
 *   }
 *
 *   route
 *   .all(validate_user)
 *   .all(check_something)
 *   .get(function(req, res, next){
 *     res.send('hello world')
 *   })
 *
 * @param {array|function} handler
 * @return {Route} for chaining
 * @api public
 */

proto.all = function all(handler) {
  const callbacks: unknown[] = flatten.call(slice.call(arguments), Infinity)

  if (callbacks.length === 0) {
    throw withCode(new TypeError('argument handler is required'), 'EXPRESS_ERR_HANDLER_REQUIRED')
  }

  for (let i = 0; i < callbacks.length; i++) {
    const fn = callbacks[i]

    if (typeof fn !== 'function') {
      throw withCode(new TypeError('argument handler must be a function'), 'EXPRESS_ERR_HANDLER_NOT_FUNCTION')
    }

    const layer = Layer('/', {}, fn as LayerHandler)
    layer.method = undefined

    this.methods._all = true
    this.stack.push(layer)
  }

  // Not in upstream (router 2.2.0, 2.3.0): the duplicate-route warning
  methodAdded(this, 'all')

  return this
}

methods.forEach(function (method) {
  proto[method] = function (handler) {
    const callbacks: unknown[] = flatten.call(slice.call(arguments), Infinity)

    if (callbacks.length === 0) {
      throw withCode(new TypeError('argument handler is required'), 'EXPRESS_ERR_HANDLER_REQUIRED')
    }

    for (let i = 0; i < callbacks.length; i++) {
      const fn = callbacks[i]

      if (typeof fn !== 'function') {
        throw withCode(new TypeError('argument handler must be a function'), 'EXPRESS_ERR_HANDLER_NOT_FUNCTION')
      }

      debug('%s %s', method, this.path)

      const layer = Layer('/', {}, fn as LayerHandler)
      layer.method = method

      this.methods[method] = true
      this.stack.push(layer)
    }

    // Not in upstream (router 2.2.0, 2.3.0): the duplicate-route warning
    methodAdded(this, method)

    return this
  }
})

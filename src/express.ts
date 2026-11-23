/*!
 * express
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

import type { Application } from './application'
import type { BodyParser } from './body-parser'
import type { Request } from './request'
import type { ExpressResponse } from './response'
import type { HandlerList, NextFunction, PathParams, RouterConstructor } from './router'
import type { ServeStaticFunction } from './serve-static'

/**
 * Module dependencies.
 *
 * Loaded with `require` and typed with `typeof import(...)`, so the compiled
 * output calls them directly, with no interop helpers in between.
 */

const bodyParser = require('./body-parser') as BodyParser
const EventEmitter = (require('node:events') as typeof import('node:events')).EventEmitter
const proto = require('./application') as Application
const Router = require('./router') as RouterConstructor
const req = require('./request') as Request
const res = require('./response') as ExpressResponse
const { originalRoute } = require('./router/lib/original-route') as typeof import('./router/lib/original-route')

/**
 * Not in Express 5.3.0: the methods the fork adds to every app. They are kept
 * off `express.application` (`proto`), whose own properties stay those of
 * Express 5.3.0, and mixed in after it, so a method of the same name patched
 * onto `express.application` still wins.
 */

const additions = {
  /**
   * Proxy `Router#error()` to add error handlers to the app router, which
   * run only for an error, whatever their length (expressjs/express#2896).
   */
  error: function error(this: Application, fn: unknown, ...rest: unknown[]) {
    this.router.error(fn as PathParams | HandlerList, ...(rest as HandlerList[]))
    return this
  }
}

/**
 * Expose `createApplication()`.
 */

exports = module.exports = createApplication

/**
 * Create an express application.
 *
 * @return {Function}
 * @api public
 */

function createApplication(): Application {
  // the methods and state below are mixed in and set before it is returned
  var app = function (req: Request, res: ExpressResponse, next?: NextFunction) {
    app.handle(req, res, next)
  } as Application

  mixin(app, EventEmitter.prototype)
  mixin(app, proto)
  mixin(app, additions)

  // expose the prototype that will get set on requests
  app.request = Object.create(req, {
    app: { configurable: true, enumerable: true, writable: true, value: app }
  })

  // expose the prototype that will get set on responses
  app.response = Object.create(res, {
    app: { configurable: true, enumerable: true, writable: true, value: app }
  })

  app.init()
  return app
}

/**
 * `req.originalRoute`: the full path pattern of the route that matched
 * (expressjs/express#2501), built by the router when it is read. Not in
 * Express 5.3.0. Not enumerable, so the request prototype keeps the own
 * enumerable keys it has in Express 5.3.0.
 */

Object.defineProperty(req, 'originalRoute', {
  configurable: true,
  enumerable: false,
  get: function getOriginalRoute(this: Request) {
    return originalRoute(this)
  }
})

/**
 * Expose the prototypes.
 */

exports.application = proto
exports.request = req
exports.response = res

/**
 * Expose constructors.
 */

exports.Route = Router.Route
exports.Router = Router

/**
 * Expose middleware
 */

exports.json = bodyParser.json
exports.raw = bodyParser.raw
exports.static = require('./serve-static') as ServeStaticFunction
exports.text = bodyParser.text
exports.urlencoded = bodyParser.urlencoded

/**
 * Copy the own properties of `source` onto `destination`, keeping their
 * descriptors, and skipping names `destination` already has. Replaces the
 * `merge-descriptors` package (called with `overwrite` false).
 *
 * @private
 */

function mixin(destination: object, source: object) {
  for (const name of Object.getOwnPropertyNames(source)) {
    if (!Object.hasOwn(destination, name)) {
      // an own property of source, so it has a descriptor
      Object.defineProperty(destination, name, Object.getOwnPropertyDescriptor(source, name) as PropertyDescriptor)
    }
  }
}

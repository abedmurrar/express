/*!
 * express
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

import type { Application } from './application'
import type { Request } from './request'
import type { ExpressResponse } from './response'
import type { NextFunction, RouterConstructor } from './router'

/**
 * Module dependencies.
 *
 * Loaded with `require` and typed with `typeof import(...)`, so the compiled
 * output calls them directly, with no interop helpers in between.
 */

const bodyParser = require('body-parser') as typeof import('body-parser')
const EventEmitter = (require('node:events') as typeof import('node:events')).EventEmitter
const proto = require('./application') as Application
const Router = require('./router') as RouterConstructor
const req = require('./request') as Request
const res = require('./response') as ExpressResponse

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
exports.static = require('serve-static') as typeof import('serve-static')
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

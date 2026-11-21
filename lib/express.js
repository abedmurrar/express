/*!
 * express
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 */

var bodyParser = require('body-parser')
var EventEmitter = require('node:events').EventEmitter
var proto = require('./application')
var Router = require('./router')
var req = require('./request')
var res = require('./response')

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

function createApplication() {
  var app = function (req, res, next) {
    app.handle(req, res, next)
  }

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
exports.static = require('serve-static')
exports.text = bodyParser.text
exports.urlencoded = bodyParser.urlencoded

/**
 * Copy the own properties of `source` onto `destination`, keeping their
 * descriptors, and skipping names `destination` already has. Replaces the
 * `merge-descriptors` package (called with `overwrite` false).
 *
 * @private
 */

function mixin(destination, source) {
  for (const name of Object.getOwnPropertyNames(source)) {
    if (!Object.hasOwn(destination, name)) {
      Object.defineProperty(destination, name, Object.getOwnPropertyDescriptor(source, name))
    }
  }
}

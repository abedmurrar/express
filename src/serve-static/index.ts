/*!
 * serve-static
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014-2016 Douglas Christopher Wilson
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

var Buffer = (require('node:buffer') as typeof import('node:buffer')).Buffer
var encodeUrl = require('encodeurl') as typeof import('encodeurl')
var escapeHtml = require('escape-html') as typeof import('escape-html')
var parseUrl = require('parseurl') as typeof import('parseurl')
var resolve = (require('path') as typeof import('path')).resolve
var send = require('../send') as SendFunction
var url = require('url') as typeof import('url')

import type { Stats } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Url } from 'node:url'
import type { HttpError } from 'http-errors'
import type { SendFunction, SendOptions, SendStream } from '../send'

/**
 * `serveStatic()` options: its own three, plus every `send()` option, which
 * it passes on.
 */
export interface ServeStaticOptions extends SendOptions {
  /** next() on client errors (a 404 or a bad request) instead of next(err), defaulting to true */
  fallthrough?: boolean | undefined
  /** redirect a directory to its path with a trailing "/", defaulting to true */
  redirect?: boolean | undefined
  /** called as setHeaders(res, path, stat) before the headers are sent */
  setHeaders?: ((res: ServerResponse, path: string, stat: Stats) => unknown) | undefined
}

/** The middleware `serveStatic()` returns. */
export type ServeStaticHandler = (req: IncomingMessage, res: ServerResponse, next: (err?: HttpError) => void) => void

/** `serveStatic` itself. */
export type ServeStaticFunction = (root: string, options?: ServeStaticOptions) => ServeStaticHandler

/**
 * Module exports.
 * @public
 */

module.exports = createServeStatic

/**
 * The exported function keeps upstream's name, `serveStatic`. Its declaration
 * is named `createServeStatic` so the coverage report doesn't list two
 * functions called `serveStatic` (the middleware below keeps that name).
 * @private
 */

Object.defineProperty(createServeStatic, 'name', { value: 'serveStatic' })

/**
 * @param {string} root
 * @param {object} [options]
 * @return {function}
 * @public
 */

function createServeStatic(root: string, options?: ServeStaticOptions): ServeStaticHandler {
  if (!root) {
    throw new TypeError('root path required')
  }

  if (typeof root !== 'string') {
    throw new TypeError('root path must be a string')
  }

  // copy options object
  var opts = Object.create(options || null) as ServeStaticOptions

  // fall-though
  var fallthrough = opts.fallthrough !== false

  // default redirect
  var redirect = opts.redirect !== false

  // headers listener
  var setHeaders = opts.setHeaders

  if (setHeaders && typeof setHeaders !== 'function') {
    throw new TypeError('option setHeaders must be function')
  }

  // setup options for send
  opts.maxage = opts.maxage || opts.maxAge || 0
  opts.root = resolve(root)

  // construct directory listener
  var onDirectory = redirect ? createRedirectDirectoryListener() : createNotFoundDirectoryListener()

  return function serveStatic(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (fallthrough) {
        return next()
      }

      // method not allowed
      res.statusCode = 405
      res.setHeader('Allow', 'GET, HEAD')
      res.setHeader('Content-Length', '0')
      res.end()
      return
    }

    var forwardError = !fallthrough
    var originalUrl = parseUrl.original(req) as Url
    var path = (parseUrl(req) as Url).pathname as string

    // make sure redirect occurs at mount
    if (path === '/' && (originalUrl.pathname as string).substr(-1) !== '/') {
      path = ''
    }

    // create send stream
    var stream = send(req, path, opts)

    // add directory handler
    stream.on('directory', onDirectory)

    // add headers listener
    if (setHeaders) {
      stream.on('headers', setHeaders)
    }

    // add file listener for fallthrough
    if (fallthrough) {
      stream.on('file', function onFile() {
        // once file is determined, always forward error
        forwardError = true
      })
    }

    // forward errors
    stream.on('error', function error(err: HttpError) {
      if (forwardError || !(err.statusCode < 500)) {
        next(err)
        return
      }

      next()
    })

    // pipe
    stream.pipe(res)
  }
}

/**
 * Collapse all leading slashes into a single slash
 * @private
 */
function collapseLeadingSlashes(str: string): string {
  for (var i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) !== 0x2f /* / */) {
      break
    }
  }

  return i > 1 ? '/' + str.substr(i) : str
}

/**
 * Create a minimal HTML document.
 *
 * @param {string} title
 * @param {string} body
 * @private
 */

function createHtmlDocument(title: string, body: string): string {
  return (
    '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<title>' +
    title +
    '</title>\n' +
    '</head>\n' +
    '<body>\n' +
    '<pre>' +
    body +
    '</pre>\n' +
    '</body>\n' +
    '</html>\n'
  )
}

/**
 * Create a directory listener that just 404s.
 * @private
 */

function createNotFoundDirectoryListener() {
  return function notFound(this: SendStream) {
    this.error(404)
  }
}

/**
 * Create a directory listener that performs a redirect.
 * @private
 */

function createRedirectDirectoryListener() {
  return function redirect(this: SendStream, res: ServerResponse) {
    if (this.hasTrailingSlash()) {
      this.error(404)
      return
    }

    // get original URL
    var originalUrl = parseUrl.original(this.req) as Url

    // append trailing slash
    originalUrl.path = null
    originalUrl.pathname = collapseLeadingSlashes(originalUrl.pathname + '/')

    // reformat the URL
    var loc = encodeUrl(url.format(originalUrl))
    var doc = createHtmlDocument('Redirecting', 'Redirecting to ' + escapeHtml(loc))

    // send redirect response
    res.statusCode = 301
    res.setHeader('Content-Type', 'text/html; charset=UTF-8')
    res.setHeader('Content-Length', Buffer.byteLength(doc))
    res.setHeader('Content-Security-Policy', "default-src 'none'")
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Location', loc)
    res.end(doc)
  }
}

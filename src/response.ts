/*!
 * express
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
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

import { Buffer } from 'node:buffer'
import type { ServerResponse } from 'node:http'
import type { CookieSerializeOptions } from 'cookie'
import type { Application } from './application'
import type { Request } from './request'
import type { SendFunction, SendStream } from './send'
import type { ETagFunction } from './utils'

const contentDisposition = require('content-disposition') as typeof import('content-disposition')
const createError = require('http-errors') as typeof import('http-errors')
const deprecate = (require('depd') as typeof import('depd'))('express')
const encodeUrl = require('encodeurl') as typeof import('encodeurl')
const escapeHtml = require('escape-html') as typeof import('escape-html')
const http = require('node:http') as typeof import('node:http')
const isAnyArrayBuffer = (require('node:util') as typeof import('node:util')).types.isAnyArrayBuffer
const onFinished = require('on-finished') as typeof import('on-finished')
const path = require('node:path') as typeof import('node:path')
const pathIsAbsolute = (require('node:path') as typeof import('node:path')).isAbsolute
const statuses = require('statuses') as typeof import('statuses')
const sign = (require('cookie-signature') as typeof import('cookie-signature')).sign
const normalizeType = (require('./utils') as typeof import('./utils')).normalizeType
const normalizeTypes = (require('./utils') as typeof import('./utils')).normalizeTypes
const setCharset = (require('./utils') as typeof import('./utils')).setCharset
const mimeContentType = (require('./utils') as typeof import('./utils')).mimeContentType
const cookie = require('cookie') as typeof import('cookie')
const send = require('./send') as SendFunction
const extname = path.extname
const resolve = path.resolve
const basename = path.basename
const vary = require('vary') as typeof import('vary')

/** A header value, as `setHeader` takes it. */
export type HeaderValue = number | string | readonly string[]

/** The `next` function the router puts on `req`. */
export type NextFunction = (err?: unknown) => void

/** A `res.format` handler. */
export type FormatHandler = (req: Request, res: ExpressResponse, next: NextFunction) => void

/** The `res.sendFile` and `res.download` callback. */
export type SendFileCallback = (err?: NodeJS.ErrnoException) => void

/** The `res.render` and `app.render` callback. */
export type RenderCallback = (err: Error | null | undefined, html?: string) => void

/**
 * `res.sendFile` options. The ones response.ts reads are listed; the others
 * pass through to `send`.
 */
export interface SendFileOptions {
  root?: string
  headers?: Record<string, HeaderValue>
  etag?: boolean
  [option: string]: unknown
}

/** `res.cookie` options: the `cookie` package's, plus `signed`. */
export interface CookieOptions extends CookieSerializeOptions {
  signed?: boolean | undefined
}

/** `res.render` options, which become the view's locals. */
export interface RenderOptions {
  _locals?: Record<string, unknown>
  [local: string]: unknown
}

/**
 * The Express response: Node's `ServerResponse` with the helpers below.
 * Parameters are as loose as the JavaScript accepts, and each method narrows
 * them the way the JavaScript does.
 */
export interface ExpressResponse extends ServerResponse<Request> {
  app: Application
  /** The request, set by the application. */
  req: Request
  locals: Record<string, unknown>
  status(code: unknown): this
  links(links: Record<string, string | string[]>): this
  send(body?: unknown): this
  json(obj?: unknown): this
  jsonp(obj?: unknown): this
  sendStatus(statusCode: number): this
  sendFile(path: unknown, options?: SendFileOptions | SendFileCallback, callback?: SendFileCallback): void
  download(
    path: string,
    filename?: string | SendFileOptions | SendFileCallback | null,
    options?: SendFileOptions | SendFileCallback | null,
    callback?: SendFileCallback
  ): void
  type(type: string): this
  contentType(type: string): this
  format(obj: Record<string, FormatHandler>): this
  attachment(filename?: string): this
  append(field: string, val: string | string[]): this
  header(field: string, val: unknown): this
  header(fields: Record<string, unknown>): this
  set(field: string, val: unknown): this
  set(fields: Record<string, unknown>): this
  get(field: string): number | string | string[] | undefined
  clearCookie(name: string, options?: CookieOptions): this
  cookie(name: string, value: unknown, options?: CookieOptions): this
  location(url: string): this
  redirect(url: unknown): void
  redirect(status: unknown, url: unknown): void
  vary(field: string | string[]): this
  render(view: string, options?: RenderOptions | RenderCallback, callback?: RenderCallback): void
}

/**
 * The messages of the ERR_HTTP_HEADERS_SENT errors named below, as Node
 * threw them.
 * @private
 */

const headersSentMessages = new WeakMap<Error, string>()

/**
 * Names the Express method in Node's ERR_HTTP_HEADERS_SENT error, which
 * otherwise only says "Cannot set headers after they are sent to the client"
 * (expressjs/express#7560). Only the message changes: the error is the same
 * object, with the same class, code and stack frames, thrown from the same
 * place. Each method that can set a header calls this from a catch block,
 * so nothing runs unless something threw, and the outermost call wins: the
 * method the app called (res.json(), not the res.set() inside it). Any
 * other error is returned untouched.
 *
 * Not in Express 5.3.0.
 * @private
 */

function headersSent(err: unknown, method: string): unknown {
  if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ERR_HTTP_HEADERS_SENT') {
    var message = headersSentMessages.get(err) ?? err.message
    headersSentMessages.set(err, message)
    err.message = message + ': ' + method + ' was called after the response headers were sent'
  }
  return err
}

/**
 * Response prototype.
 * @public
 */

var res: ExpressResponse = Object.create(http.ServerResponse.prototype)

/**
 * Module exports.
 * @public
 */

module.exports = res

/**
 * Set the HTTP status code for the response.
 *
 * Expects an integer value between 100 and 999 inclusive.
 * Throws an error if the provided status code is not an integer or if it's outside the allowable range.
 *
 * @param {number} code - The HTTP status code to set.
 * @return {ServerResponse} - Returns itself for chaining methods.
 * @throws {TypeError} If `code` is not an integer.
 * @throws {RangeError} If `code` is outside the range 100 to 999.
 * @public
 */

res.status = function status(this: ExpressResponse, code: unknown) {
  // Check if the status code is not an integer
  if (!isInteger(code)) {
    throw new TypeError(`Invalid status code: ${JSON.stringify(code)}. Status code must be an integer.`)
  }
  // Check if the status code is outside of Node's valid range
  if (code < 100 || code > 999) {
    throw new RangeError(
      `Invalid status code: ${JSON.stringify(code)}. Status code must be greater than 99 and less than 1000.`
    )
  }

  this.statusCode = code
  return this
}

/**
 * Set Link header field with the given `links`.
 *
 * Examples:
 *
 *    res.links({
 *      next: 'http://api.example.com/users?page=2',
 *      last: 'http://api.example.com/users?page=5',
 *      pages: [
 *        'http://api.example.com/users?page=1',
 *        'http://api.example.com/users?page=2'
 *      ]
 *    });
 *
 * @param {Object} links
 * @return {ServerResponse}
 * @public
 */

res.links = function (this: ExpressResponse, links: Record<string, string | string[]>) {
  try {
    var values: string[] = []
    Object.keys(links).forEach(function (rel) {
      var targets = links[rel]
      // Allow multiple links if links[rel] is an array
      if (Array.isArray(targets)) {
        targets.forEach(function (target) {
          values.push(`<${target}>; rel="${rel}"`)
        })
      } else {
        values.push(`<${targets}>; rel="${rel}"`)
      }
    })

    // Nothing to add (an empty object, or only empty arrays): leave the header
    // as it is, rather than sending an empty Link or a trailing ", "
    if (values.length === 0) return this

    var link = this.get('Link') || ''
    if (link) link += ', '
    return this.set('Link', link + values.join(', '))
  } catch (err) {
    throw headersSent(err, 'res.links()')
  }
}

/**
 * Send a response.
 *
 * Examples:
 *
 *     res.send(Buffer.from('wahoo'));
 *     res.send({ some: 'json' });
 *     res.send('<p>some html</p>');
 *
 * @param {string|number|boolean|object|Buffer} body
 * @public
 */

res.send = function send(this: ExpressResponse, body?: unknown) {
  try {
    var chunk: unknown = body
    var encoding: BufferEncoding | undefined
    var req = this.req

    // settings
    var app = this.app

    switch (typeof chunk) {
      // string defaulting to html
      case 'string':
        encoding = 'utf8'
        const type = this.get('Content-Type')

        // a value with no "/" isn't a media type and has no charset to set:
        // res.set keeps an unknown type such as "not-a-type" as given, and it
        // is sent as it is (setCharset would throw on it)
        if (typeof type === 'string') {
          if (type.indexOf('/') !== -1) this.set('Content-Type', setCharset(type, 'utf-8'))
        } else {
          this.type('html')
        }
        break
      case 'boolean':
      case 'number':
      case 'object':
        if (chunk === null) {
          chunk = ''
        } else if (ArrayBuffer.isView(chunk)) {
          if (!this.get('Content-Type')) {
            this.type('bin')
          }

          // send the view's own bytes: Buffer.from(view) copies one byte per
          // element (so a Uint16Array loses its high bytes) and gives nothing
          // for a DataView, and res.end() rejects views other than Uint8Array.
          // A Buffer over the same memory gives the exact byteOffset and
          // byteLength window, with or without an ETag. A view whose buffer was
          // transferred (detached) has no bytes and sends none, as before;
          // Buffer.from would throw on its buffer.
          if (!Buffer.isBuffer(chunk)) {
            chunk =
              chunk.byteLength === 0 ? Buffer.alloc(0) : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
          }
        } else if (isAnyArrayBuffer(chunk)) {
          // an ArrayBuffer or SharedArrayBuffer is binary data too, not an
          // object to send as JSON ({}). A detached one has no bytes.
          if (!this.get('Content-Type')) {
            this.type('bin')
          }

          chunk = chunk.byteLength === 0 ? Buffer.alloc(0) : Buffer.from(chunk)
        } else {
          return this.json(chunk)
        }
        break
    }

    // determine if ETag should be generated (const, so that TypeScript narrows
    // etagFn through generateETag below)
    const etagFn = app.get('etag fn') as ETagFunction | undefined
    const generateETag = !this.get('ETag') && typeof etagFn === 'function'

    // chunk is a string or an ArrayBufferView here, or any other value that
    // passed the switch untouched (a function, symbol or bigint), which Buffer
    // rejects below exactly as in Express. The casts keep those reads and calls
    // as they were.
    var len: number | undefined
    if (chunk !== undefined) {
      if (Buffer.isBuffer(chunk)) {
        // get length of Buffer
        len = chunk.length
      } else if (!generateETag && (chunk as { length: number }).length < 1000) {
        // just calculate length when no ETag + small chunk
        len = Buffer.byteLength(chunk as string, encoding)
      } else {
        // convert chunk to Buffer and calculate
        chunk = Buffer.from(chunk as string, encoding)
        encoding = undefined
        // TypeScript doesn't narrow an unknown variable on assignment
        len = (chunk as Buffer).length
      }

      // Because Content-Length and Transfer-Encoding can't be present in the response headers together,
      // Content-Length should be added only if there is no Transfer-Encoding header
      if (!this.get('Transfer-Encoding')) {
        this.set('Content-Length', len)
      }
    }

    // populate ETag
    // when generateETag is set, chunk went through Buffer.from above
    var etag: string
    if (generateETag && len !== undefined) {
      if ((etag = etagFn(chunk as Buffer, encoding))) {
        this.set('ETag', etag)
      }
    }

    // freshness
    if (req.fresh) this.status(304)

    // strip irrelevant headers
    if (204 === this.statusCode || 304 === this.statusCode) {
      this.removeHeader('Content-Type')
      this.removeHeader('Content-Length')
      this.removeHeader('Transfer-Encoding')
      chunk = ''
    }

    // alter headers for 205
    if (this.statusCode === 205) {
      this.set('Content-Length', '0')
      this.removeHeader('Transfer-Encoding')
      chunk = ''
    }

    if (req.method === 'HEAD') {
      // skip body for HEAD
      this.end()
    } else {
      // respond (Node takes an undefined encoding; its typings only list a set one)
      this.end(chunk, encoding as BufferEncoding)
    }

    return this
  } catch (err) {
    throw headersSent(err, 'res.send()')
  }
}

/**
 * Send JSON response.
 *
 * Examples:
 *
 *     res.json(null);
 *     res.json({ user: 'tj' });
 *
 * @param {string|number|boolean|object} obj
 * @public
 */

res.json = function json(this: ExpressResponse, obj?: unknown) {
  try {
    // settings
    var app = this.app
    var escape = app.get('json escape')
    var replacer = app.get('json replacer')
    var spaces = app.get('json spaces')
    var body = stringify(obj, replacer, spaces, escape)

    // content-type
    if (!this.get('Content-Type')) {
      this.set('Content-Type', 'application/json')
    }

    return this.send(body)
  } catch (err) {
    throw headersSent(err, 'res.json()')
  }
}

/**
 * Send JSON response with JSONP callback support.
 *
 * Examples:
 *
 *     res.jsonp(null);
 *     res.jsonp({ user: 'tj' });
 *
 * @param {string|number|boolean|object} obj
 * @public
 */

res.jsonp = function jsonp(this: ExpressResponse, obj?: unknown) {
  try {
    // settings
    var app = this.app
    var escape = app.get('json escape')
    var replacer = app.get('json replacer')
    var spaces = app.get('json spaces')
    var body = stringify(obj, replacer, spaces, escape)
    // the setting is used as a property key as it is
    var callback: unknown = (this.req.query as Record<string, unknown>)[app.get('jsonp callback name') as string]

    // content-type
    if (!this.get('Content-Type')) {
      this.set('X-Content-Type-Options', 'nosniff')
      this.set('Content-Type', 'application/json')
    }

    // fixup callback
    if (Array.isArray(callback)) {
      callback = callback[0]
    }

    // restrict callback charset, before the check below, so a callback that
    // has no allowed characters gets plain JSON instead of broken JavaScript
    if (typeof callback === 'string') {
      callback = callback.replace(/[^\[\]\w$.]/g, '')
    }

    // jsonp
    if (typeof callback === 'string' && callback.length !== 0) {
      this.set('X-Content-Type-Options', 'nosniff')
      this.set('Content-Type', 'text/javascript')

      if (body === undefined) {
        // empty argument
        body = ''
      } else if (typeof body === 'string') {
        // replace chars not allowed in JavaScript that are in JSON
        body = body.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
      }

      // the /**/ is a specific security mitigation for "Rosetta Flash JSONP abuse"
      // the typeof check is just to reduce client error noise
      body = '/**/ typeof ' + callback + " === 'function' && " + callback + '(' + body + ');'
    }

    return this.send(body)
  } catch (err) {
    throw headersSent(err, 'res.jsonp()')
  }
}

/**
 * Send given HTTP status code.
 *
 * Sets the response status to `statusCode` and the body of the
 * response to the standard description from node's http.STATUS_CODES
 * or the statusCode number if no description.
 *
 * Examples:
 *
 *     res.sendStatus(200);
 *
 * @param {number} statusCode
 * @public
 */

res.sendStatus = function sendStatus(this: ExpressResponse, statusCode: number) {
  try {
    var body = statuses.message[statusCode] || String(statusCode)

    this.status(statusCode)
    this.type('txt')

    return this.send(body)
  } catch (err) {
    throw headersSent(err, 'res.sendStatus()')
  }
}

/**
 * Transfer the file at the given `path`.
 *
 * Automatically sets the _Content-Type_ response header field.
 * The callback `callback(err)` is invoked when the transfer is complete
 * or when an error occurs. Be sure to check `res.headersSent`
 * if you wish to attempt responding, as the header and some data
 * may have already been transferred.
 *
 * Options:
 *
 *   - `maxAge`   defaulting to 0 (can be string converted by `ms`)
 *   - `root`     root directory for relative filenames
 *   - `headers`  object of headers to serve with file
 *   - `dotfiles` serve dotfiles, defaulting to false; can be `"allow"` to send them
 *
 * Other options are passed along to `send`.
 *
 * Examples:
 *
 *  The following example illustrates how `res.sendFile()` may
 *  be used as an alternative for the `static()` middleware for
 *  dynamic situations. The code backing `res.sendFile()` is actually
 *  the same code, so HTTP cache support etc is identical.
 *
 *     app.get('/user/:uid/photos/:file', function(req, res){
 *       var uid = req.params.uid
 *         , file = req.params.file;
 *
 *       req.user.mayViewFilesFrom(uid, function(yes){
 *         if (yes) {
 *           res.sendFile('/uploads/' + uid + '/' + file);
 *         } else {
 *           res.send(403, 'Sorry! you can\'t see that.');
 *         }
 *       });
 *     });
 *
 * @public
 */

res.sendFile = function sendFile(
  this: ExpressResponse,
  path: unknown,
  options?: SendFileOptions | SendFileCallback,
  callback?: SendFileCallback
) {
  var done = callback
  var req = this.req
  var res = this
  var next = req.next
  // a function here is replaced with {} below, before opts is read
  var opts = (options || {}) as SendFileOptions

  if (!path) {
    throw new TypeError('path argument is required to res.sendFile')
  }

  if (typeof path !== 'string') {
    throw new TypeError('path must be a string to res.sendFile')
  }

  // support function as second arg
  if (typeof options === 'function') {
    done = options
    opts = {}
  }

  if (!opts.root && !pathIsAbsolute(path)) {
    throw new TypeError('path must be absolute or specify root to res.sendFile')
  }

  // create file stream
  var pathname = encodeURI(path)

  // wire application etag option to send, as the default: a per-call etag
  // option wins, and the caller's object is left as it is (send reads the
  // inherited options, as res.download already relies on)
  opts = Object.create(opts) as SendFileOptions
  opts.etag ??= this.app.enabled('etag')
  var file = send(req, pathname, opts)

  // transfer
  sendfile(res, file, opts, function (err?: NodeJS.ErrnoException) {
    if (done) return done(err)
    if (err && err.code === 'EISDIR') return next()

    // next() all but write errors
    if (err && err.code !== 'ECONNABORTED' && err.syscall !== 'write') {
      next(err)
    }
  })
}

/**
 * Transfer the file at the given `path` as an attachment.
 *
 * Optionally providing an alternate attachment `filename`,
 * and optional callback `callback(err)`. The callback is invoked
 * when the data transfer is complete, or when an error has
 * occurred. Be sure to check `res.headersSent` if you plan to respond.
 *
 * Optionally providing an `options` object to use with `res.sendFile()`.
 * This function will set the `Content-Disposition` header, overriding
 * any `Content-Disposition` header passed as header options in order
 * to set the attachment and filename.
 *
 * This method uses `res.sendFile()`.
 *
 * @public
 */

res.download = function download(
  this: ExpressResponse,
  path: string,
  filename?: string | SendFileOptions | SendFileCallback | null,
  options?: SendFileOptions | SendFileCallback | null,
  callback?: SendFileCallback
) {
  var done = callback
  var name = filename
  // a function here is replaced with null below, before opts is read
  var opts = (options || null) as SendFileOptions | null

  // support function as second or third arg
  if (typeof filename === 'function') {
    done = filename
    name = null
    opts = null
  } else if (typeof options === 'function') {
    done = options
    opts = null
  }

  // support optional filename, where options may be in its place
  if (typeof filename === 'object' && (typeof options === 'function' || options === undefined)) {
    name = null
    opts = filename
  }

  // set Content-Disposition when file is sent. name is a string here, or an
  // object or function when the arguments match no supported form, which
  // basename rejects exactly as in Express.
  var headers: Record<string, HeaderValue> = {
    'Content-Disposition': contentDisposition.create(basename((name || path) as string))
  }

  // merge user-provided headers
  if (opts && opts.headers) {
    var keys = Object.keys(opts.headers)
    // the `!`s: i is in bounds, and key is one of the object's own keys
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i]!
      if (key.toLowerCase() !== 'content-disposition') {
        headers[key] = opts.headers[key]!
      }
    }
  }

  // merge user-provided options
  opts = Object.create(opts) as SendFileOptions
  opts.headers = headers

  // Resolve the full path for sendFile
  var fullPath = !opts.root ? resolve(path) : path

  // send file
  return this.sendFile(fullPath, opts, done)
}

/**
 * Set _Content-Type_ response header with `type` through `mime.contentType()`
 * when it does not contain "/", or set the Content-Type to `type` otherwise.
 * When no mapping is found through `mime.contentType()`, the type is set to
 * "application/octet-stream".
 *
 * Examples:
 *
 *     res.type('.html');
 *     res.type('html');
 *     res.type('json');
 *     res.type('application/json');
 *     res.type('png');
 *
 * @param {String} type
 * @return {ServerResponse} for chaining
 * @public
 */

res.contentType = res.type = function contentType(this: ExpressResponse, type: string) {
  try {
    var ct = type.indexOf('/') === -1 ? mimeContentType(type) || 'application/octet-stream' : type

    return this.set('Content-Type', ct)
  } catch (err) {
    throw headersSent(err, 'res.type()')
  }
}

/**
 * Respond to the Acceptable formats using an `obj`
 * of mime-type callbacks.
 *
 * This method uses `req.accepts()`, which returns the
 * best match from the acceptable types ordered by
 * their quality values.
 * When "Accept" is not present the _first_ callback
 * is invoked, otherwise the first match is used. When
 * no match is performed the server responds with
 * 406 "Not Acceptable".
 *
 * Content-Type is set for you, however if you choose
 * you may alter this within the callback using `res.type()`
 * or `res.set('Content-Type', ...)`.
 *
 *    res.format({
 *      'text/plain': function(){
 *        res.send('hey');
 *      },
 *
 *      'text/html': function(){
 *        res.send('<p>hey</p>');
 *      },
 *
 *      'application/json': function () {
 *        res.send({ message: 'hey' });
 *      }
 *    });
 *
 * In addition to canonicalized MIME types you may
 * also use extnames mapped to these types:
 *
 *    res.format({
 *      text: function(){
 *        res.send('hey');
 *      },
 *
 *      html: function(){
 *        res.send('<p>hey</p>');
 *      },
 *
 *      json: function(){
 *        res.send({ message: 'hey' });
 *      }
 *    });
 *
 * By default Express passes an `Error`
 * with a `.status` of 406 to `next(err)`
 * if a match is not made. If you provide
 * a `.default` callback it will be invoked
 * instead.
 *
 * @param {Object} obj
 * @return {ServerResponse} for chaining
 * @public
 */

res.format = function (this: ExpressResponse, obj: Record<string, FormatHandler>) {
  var req = this.req
  var next = req.next

  var keys = Object.keys(obj).filter(function (v) {
    return v !== 'default'
  })

  // a non-empty list gives one type, or false
  var key = keys.length > 0 ? (req.accepts(keys) as string | false) : false

  // after another response, this is what throws ERR_HTTP_HEADERS_SENT; a
  // handler below that sends twice names its own method
  try {
    this.vary('Accept')
  } catch (err) {
    throw headersSent(err, 'res.format()')
  }

  if (key) {
    this.set('Content-Type', normalizeType(key).value)
    // key is one of obj's own keys, picked by req.accepts
    obj[key]!(req, this, next)
  } else if (obj.default) {
    obj.default(req, this, next)
  } else {
    next(
      createError(406, {
        types: normalizeTypes(keys).map(function (o) {
          return o.value
        })
      })
    )
  }

  return this
}

/**
 * Set _Content-Disposition_ header to _attachment_ with optional `filename`.
 *
 * @param {String} filename
 * @return {ServerResponse}
 * @public
 */

res.attachment = function attachment(this: ExpressResponse, filename?: string) {
  try {
    const name = filename !== undefined ? basename(filename) : undefined
    if (name) {
      this.type(extname(name))
    }

    this.set('Content-Disposition', contentDisposition.create(name))

    return this
  } catch (err) {
    throw headersSent(err, 'res.attachment()')
  }
}

/**
 * Append additional header `field` with value `val`.
 *
 * Example:
 *
 *    res.append('Link', ['<http://localhost/>', '<http://localhost:3000/>']);
 *    res.append('Set-Cookie', 'foo=bar; Path=/; HttpOnly');
 *    res.append('Warning', '199 Miscellaneous warning');
 *
 * @param {String} field
 * @param {String|Array} val
 * @return {ServerResponse} for chaining
 * @public
 */

res.append = function append(this: ExpressResponse, field: string, val: string | string[]) {
  try {
    var prev = this.get(field)
    var value: string | string[] | (string | number)[] = val

    // an existing empty value (or a number 0 set through res.setHeader) is
    // still a value: keep it
    if (prev !== undefined) {
      // concat the new and prev vals
      value = Array.isArray(prev) ? prev.concat(val) : Array.isArray(val) ? [prev].concat(val) : [prev, val]
    }

    return this.set(field, value)
  } catch (err) {
    throw headersSent(err, 'res.append()')
  }
}

/**
 * Set header `field` to `val`, or pass
 * an object of header fields.
 *
 * Examples:
 *
 *    res.set('Foo', ['bar', 'baz']);
 *    res.set('Accept', 'application/json');
 *    res.set({ Accept: 'text/plain', 'X-API-Key': 'tobi' });
 *
 * Aliased as `res.header()`.
 *
 * When the set header is "Content-Type", the type is expanded to include
 * the charset if not present using `mime.contentType()`.
 *
 * @param {String|Object} field
 * @param {String|Array} val
 * @return {ServerResponse} for chaining
 * @public
 */

res.set = res.header = function header(this: ExpressResponse, field: string | Record<string, unknown>, val?: unknown) {
  try {
    // TypeScript can't tie arguments.length to the parameter types, so the
    // casts below say which form each branch handles. A field of the other kind
    // behaves exactly as in Express (toLowerCase throws, or for-in walks it).
    if (arguments.length === 2) {
      var value: string | string[] = Array.isArray(val) ? val.map(String) : String(val)

      // add charset to content-type
      if ((field as string).toLowerCase() === 'content-type') {
        if (Array.isArray(value)) {
          throw new TypeError('Content-Type cannot be set to an Array')
        }
        // mime.contentType gives false for a type it doesn't know, which Node
        // would write as "false"; keep the value as given instead
        value = mimeContentType(value) || value
      }

      this.setHeader(field as string, value)
    } else {
      for (var key in field as Record<string, unknown>) {
        this.set(key, (field as Record<string, unknown>)[key])
      }
    }
    return this
  } catch (err) {
    throw headersSent(err, 'res.set()')
  }
}

/**
 * Get value for header `field`.
 *
 * @param {String} field
 * @return {String}
 * @public
 */

res.get = function (this: ExpressResponse, field: string) {
  return this.getHeader(field)
}

/**
 * Clear cookie `name`.
 *
 * @param {String} name
 * @param {Object} [options]
 * @return {ServerResponse} for chaining
 * @public
 */

res.clearCookie = function clearCookie(this: ExpressResponse, name: string, options?: CookieOptions) {
  try {
    // Force cookie expiration by setting expires to the past
    const opts = { path: '/', ...options, expires: new Date(1) }
    // ensure maxAge is not passed
    delete opts.maxAge

    return this.cookie(name, '', opts)
  } catch (err) {
    throw headersSent(err, 'res.clearCookie()')
  }
}

/**
 * Set cookie `name` to `value`, with the given `options`.
 *
 * Options:
 *
 *    - `maxAge`   max-age in milliseconds, converted to `expires`
 *    - `signed`   sign the cookie
 *    - `path`     defaults to "/"
 *
 * Examples:
 *
 *    // "Remember Me" for 15 minutes
 *    res.cookie('rememberme', '1', { expires: new Date(Date.now() + 900000), httpOnly: true });
 *
 *    // same as above
 *    res.cookie('rememberme', '1', { maxAge: 900000, httpOnly: true })
 *
 * @param {String} name
 * @param {String|Object} value
 * @param {Object} [options]
 * @return {ServerResponse} for chaining
 * @public
 */

res.cookie = function (this: ExpressResponse, name: string, value: unknown, options?: CookieOptions) {
  try {
    var opts = { ...options }
    var secret = this.req.secret
    var signed = opts.signed

    if (signed && !secret) {
      throw new Error('cookieParser("secret") required for signed cookies')
    }

    var val = typeof value === 'object' ? 'j:' + JSON.stringify(value) : String(value)

    if (signed) {
      // the check above threw when signed is set without a secret
      val = 's:' + sign(val, secret!)
    }

    if (opts.maxAge != null) {
      var maxAge = opts.maxAge - 0

      if (!isNaN(maxAge)) {
        // expires: 0 asks for Max-Age without Expires, so it is kept (cookie
        // leaves out a falsy expires); the type only lists a Date
        if ((opts.expires as unknown) !== 0) {
          opts.expires = new Date(Date.now() + maxAge)
        }
        opts.maxAge = Math.floor(maxAge / 1000)
      }
    }

    if (opts.path == null) {
      opts.path = '/'
    }

    this.append('Set-Cookie', cookie.serialize(name, String(val), opts))

    return this
  } catch (err) {
    throw headersSent(err, 'res.cookie()')
  }
}

/**
 * Set the location header to `url`.
 *
 * Examples:
 *
 *    res.location('/foo/bar');
 *    res.location('http://example.com');
 *    res.location('../login');
 *
 * @param {String} url
 * @return {ServerResponse} for chaining
 * @public
 */

res.location = function location(this: ExpressResponse, url: string) {
  try {
    return this.set('Location', encodeUrl(url))
  } catch (err) {
    throw headersSent(err, 'res.location()')
  }
}

/**
 * Redirect to the given `url` with optional response `status`
 * defaulting to 302.
 *
 * Examples:
 *
 *    res.redirect('/foo/bar');
 *    res.redirect('http://example.com');
 *    res.redirect(301, 'http://example.com');
 *    res.redirect('../login'); // /blog/post/1 -> /blog/login
 *
 * @public
 */

res.redirect = function redirect(this: ExpressResponse, url: unknown) {
  try {
    var address: unknown = url
    // set by whichever format handler below runs
    var body!: string
    var status: unknown = 302

    // allow status / url
    if (arguments.length === 2) {
      status = arguments[0]
      address = arguments[1]
    }

    if (!address) {
      deprecate('Provide a url argument')
    }

    if (typeof address !== 'string') {
      deprecate('Url must be a string')
    }

    if (typeof status !== 'number') {
      deprecate('Status must be a number')
    }

    // Set location header (a url that isn't a string only gets the warnings
    // above, and encodeurl turns it into a string)
    address = this.location(address as string).get('Location')

    // Support text/{plain,html} by default. A status without a standard
    // message is named by its number, as in res.sendStatus
    var message = statuses.message[status as number] || String(status)
    this.format({
      text: function () {
        body = message + '. Redirecting to ' + address
      },

      html: function () {
        // location() stored a string
        var u = escapeHtml(address as string)
        body =
          '<!DOCTYPE html><head><title>' +
          message +
          '</title></head>' +
          '<body><p>' +
          message +
          '. Redirecting to ' +
          u +
          '</p></body>'
      },

      default: function () {
        body = ''
      }
    })

    // Respond
    this.status(status)

    // Content-Length and Transfer-Encoding can't be sent together, as in res.send
    if (!this.get('Transfer-Encoding')) {
      this.set('Content-Length', Buffer.byteLength(body))
    }

    if (this.req.method === 'HEAD') {
      this.end()
    } else {
      this.end(body)
    }
  } catch (err) {
    throw headersSent(err, 'res.redirect()')
  }
}

/**
 * Add `field` to Vary. If already present in the Vary set, then
 * this call is simply ignored.
 *
 * @param {Array|String} field
 * @return {ServerResponse} for chaining
 * @public
 */

res.vary = function (this: ExpressResponse, field: string | string[]) {
  try {
    vary(this, field)

    return this
  } catch (err) {
    throw headersSent(err, 'res.vary()')
  }
}

/**
 * Render `view` with the given `options` and optional callback `fn`.
 * When a callback function is given a response will _not_ be made
 * automatically, otherwise a response of _200_ and _text/html_ is given.
 *
 * Options:
 *
 *  - `cache`     boolean hinting to the engine it should cache
 *  - `filename`  filename of the view being rendered
 *
 * @public
 */

res.render = function render(
  this: ExpressResponse,
  view: string,
  options?: RenderOptions | RenderCallback,
  callback?: RenderCallback
) {
  var app = this.req.app
  var done = callback
  // a function here is replaced with {} below, before opts is read
  var opts = (options || {}) as RenderOptions
  var req = this.req
  var self = this

  // support callback function as second arg
  if (typeof options === 'function') {
    done = options
    opts = {}
  }

  // merge res.locals, into a copy: the caller's object may be shared between
  // requests (it would keep the last request's res.locals) or frozen (the
  // assignment would throw). app.render copies its own enumerable properties
  // either way, so the engine gets the same options.
  opts = { ...opts, _locals: self.locals }

  // default callback to respond. It runs from the engine's callback, which
  // View#render always defers, so nothing up the stack would catch a throw
  // from res.send (such as ERR_HTTP_HEADERS_SENT after another response was
  // sent): it goes to next(err) instead of ending the process.
  done =
    done ||
    function (err: Error | null | undefined, str?: string) {
      if (err) return req.next(err)
      try {
        self.send(str)
      } catch (sendErr) {
        req.next(headersSent(sendErr, 'res.render()'))
      }
    }

  // render
  app.render(view, opts, done)
}

// pipe the send file stream
function sendfile(res: ExpressResponse, file: SendStream, options: SendFileOptions, callback: SendFileCallback) {
  var done = false
  var streaming: boolean | undefined

  // request aborted
  function onaborted() {
    if (done) return
    done = true

    var err: NodeJS.ErrnoException = new Error('Request aborted')
    err.code = 'ECONNABORTED'
    callback(err)
  }

  // directory
  function ondirectory() {
    // guards a race (the response finished or aborted before the stat came
    // back) that a test cannot trigger deterministically
    /* c8 ignore next */
    if (done) return
    done = true

    var err: NodeJS.ErrnoException = new Error('EISDIR, read')
    err.code = 'EISDIR'
    callback(err)
  }

  // errors
  function onerror(err: NodeJS.ErrnoException) {
    if (done) return
    done = true
    callback(err)
  }

  // ended
  function onend() {
    if (done) return
    done = true
    callback()
  }

  // file
  function onfile() {
    streaming = false
  }

  // finished
  function onfinish(err: NodeJS.ErrnoException | null) {
    if (err && err.code === 'ECONNRESET') return onaborted()
    if (err) return onerror(err)
    if (done) return

    setImmediate(function () {
      if (streaming !== false && !done) {
        onaborted()
        return
      }

      if (done) return
      done = true
      callback()
    })
  }

  // streaming
  function onstream() {
    streaming = true
  }

  file.on('directory', ondirectory)
  file.on('end', onend)
  file.on('error', onerror)
  file.on('file', onfile)
  file.on('stream', onstream)
  onFinished(res, onfinish)

  if (options.headers) {
    // set headers on successful transfer
    file.on('headers', function headers(res: ServerResponse) {
      // the `!`s: headers was checked above, i is in bounds, and k is one of
      // the object's own keys
      var obj = options.headers!
      var keys = Object.keys(obj)

      for (var i = 0; i < keys.length; i++) {
        var k = keys[i]!
        res.setHeader(k, obj[k]!)
      }
    })
  }

  // pipe
  file.pipe(res)
}

/**
 * Stringify JSON, like JSON.stringify, but v8 optimized, with the
 * ability to escape characters that can trigger HTML sniffing.
 *
 * @param {*} value
 * @param {function} replacer
 * @param {number} spaces
 * @param {boolean} escape
 * @returns {string}
 * @private
 */

function stringify(value: unknown, replacer: unknown, spaces: unknown, escape: unknown): string | undefined {
  // v8 checks arguments.length for optimizing simple call
  // https://bugs.chromium.org/p/v8/issues/detail?id=4730
  // JSON.stringify takes any replacer and space at run time, ignoring the ones
  // it can't use; the casts only pick its overload.
  var json: string | undefined =
    replacer || spaces
      ? JSON.stringify(value, replacer as (this: unknown, key: string, value: unknown) => unknown, spaces as string)
      : JSON.stringify(value)

  if (escape && typeof json === 'string') {
    json = json.replace(/[<>&]/g, function (c) {
      switch (c.charCodeAt(0)) {
        case 0x3c:
          return '\\u003c'
        case 0x3e:
          return '\\u003e'
        default:
          // the only character left: the regex matches <, > and &
          return '\\u0026'
      }
    })
  }

  return json
}

/**
 * `Number.isInteger` as a type guard.
 *
 * @param {*} value
 * @returns {boolean}
 * @private
 */

function isInteger(value: unknown): value is number {
  return Number.isInteger(value)
}

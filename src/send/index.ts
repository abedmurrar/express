/*!
 * send
 * Copyright(c) 2012 TJ Holowaychuk
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

var Buffer = (require('node:buffer') as typeof import('node:buffer')).Buffer
var createError = require('http-errors') as typeof import('http-errors')
var debug = (require('debug') as typeof import('debug'))('send')
var encodeUrl = require('encodeurl') as typeof import('encodeurl')
var escapeHtml = require('escape-html') as typeof import('escape-html')
var etag = require('etag') as typeof import('etag')
var fresh = require('fresh') as typeof import('fresh')
var fs = require('fs') as typeof import('fs')
var mime = require('mime-types') as typeof import('mime-types')
var ms = require('ms') as typeof import('ms')
var onFinished = require('on-finished') as typeof import('on-finished')
var parseRange = require('range-parser') as typeof import('range-parser')
var path = require('path') as typeof import('path')
var statuses = require('statuses') as typeof import('statuses')
var Stream = require('stream') as typeof import('stream')
var util = require('util') as typeof import('util')

import type { EventEmitter } from 'node:events'
import type { Stats } from 'node:fs'
import type { IncomingMessage, OutgoingHttpHeader, OutgoingHttpHeaders, ServerResponse } from 'node:http'
import type { Stream as NodeStream } from 'node:stream'
import type { Range, Ranges, Result as RangeResult } from 'range-parser'
import type { StringValue } from 'ms'

/** `fs.createReadStream()`'s options object (`@types/node` doesn't export its name). */
type ReadStreamOptions = Exclude<Parameters<typeof fs.createReadStream>[1], BufferEncoding | undefined>

/**
 * `send()` options. Every option is also passed on to `fs.createReadStream()`
 * (with `start` and `end` replaced by the range being sent), so its options
 * are accepted too.
 */
export interface SendOptions extends ReadStreamOptions {
  /** accept ranged requests and send Accept-Ranges, defaulting to true */
  acceptRanges?: boolean | undefined
  /** send Cache-Control, defaulting to true */
  cacheControl?: boolean | undefined
  /** how a path with a dotfile in it is treated, defaulting to "ignore" (a 404) */
  dotfiles?: 'allow' | 'deny' | 'ignore' | undefined
  /** the byte offset to stop at (inclusive) */
  end?: number | undefined
  /** send an ETag, defaulting to true */
  etag?: boolean | undefined
  /** extensions to try when a file without one is not found */
  extensions?: string | string[] | false | undefined
  /** add `immutable` to Cache-Control, defaulting to false */
  immutable?: boolean | undefined
  /** index files to try for a path ending in "/", defaulting to "index.html"; false turns it off */
  index?: string | string[] | false | undefined
  /** send Last-Modified, defaulting to true */
  lastModified?: boolean | undefined
  /** the Cache-Control max-age, in milliseconds or as an `ms` string, defaulting to 0 */
  maxAge?: number | string | undefined
  /** an alias of `maxAge` */
  maxage?: number | string | undefined
  /** the directory a relative path is served from */
  root?: string | undefined
  /** the byte offset to start at */
  start?: number | undefined
  [option: string]: unknown
}

/**
 * What `error()` is given with the status: the error that caused it, or (for
 * a 416) only the headers to send. An error's own `headers` are sent too.
 */
export type SendErrorDetails = { headers?: OutgoingHttpHeaders | undefined }

/**
 * The stream `send()` returns. Pipe it to the response; it emits `directory`,
 * `end`, `error`, `file`, `headers` and `stream` as it goes.
 */
export interface SendStream extends NodeStream {
  options: SendOptions
  path: string
  req: IncomingMessage
  /** the response, set by `pipe()` */
  res: ServerResponse
  _acceptRanges: boolean
  _cacheControl: boolean
  _etag: boolean
  _dotfiles: 'allow' | 'deny' | 'ignore'
  _extensions: string[]
  _immutable: boolean
  _index: string[]
  _lastModified: boolean
  /** in milliseconds */
  _maxage: number
  _root: string | null
  error(status: number, err?: (Error & SendErrorDetails) | SendErrorDetails): void
  hasTrailingSlash(): boolean
  isConditionalGET(): string | undefined
  isPreconditionFailure(): boolean
  removeContentHeaderFields(): void
  notModified(): void
  headersAlreadySent(): void
  isCachable(): boolean
  onStatError(error: NodeJS.ErrnoException): void
  isFresh(): boolean
  isRangeFresh(): boolean
  redirect(path: string): void
  /**
   * Starts sending to `res` and returns it. Typed like `Stream`'s `pipe`, which
   * it overrides; `res` must be an HTTP response (`ServerResponse`).
   */
  pipe<T extends NodeJS.WritableStream>(res: T): T
  /**
   * `sizeUnknown` is set by `send` itself, once it has read the first byte of
   * a regular file that stats as 0 bytes: true when that file has content.
   */
  send(path: string, stat: Stats, sizeUnknown?: boolean): void
  sendFile(path: string): void
  sendIndex(path: string): void
  stream(path: string, options: SendOptions): void
  type(path: string): void
  setHeader(path: string, stat: Stats): void
}

/** `send` itself: returns a `SendStream` for `req` and `path`. */
export type SendFunction = (req: IncomingMessage, path: string, options?: SendOptions) => SendStream

/** The `SendStream` constructor, which `send()` calls with `new`. */
interface SendStreamConstructor {
  new (req: IncomingMessage, path: string, options?: SendOptions): SendStream
  prototype: SendStream
}

/**
 * The constructor's view of `this`: `_maxage` holds the raw option until the
 * constructor converts it to milliseconds.
 */
type SendStreamInit = Omit<SendStream, '_maxage'> & { _maxage: number | string | undefined }

/**
 * Path function references.
 * @private
 */

var extname = path.extname
var join = path.join
var normalize = path.normalize
var resolve = path.resolve
var sep = path.sep

/**
 * Regular expression for identifying a bytes Range header.
 * @private
 */

var BYTES_RANGE_REGEXP = /^ *bytes=/

/**
 * Maximum value allowed for the max age.
 * @private
 */

var MAX_MAXAGE = 60 * 60 * 24 * 365 * 1000 // 1 year

/**
 * Regular expression to match a path with a directory up component.
 * @private
 */

var UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/

/**
 * Module exports.
 * @public
 */

module.exports = send

/**
 * Return a `SendStream` for `req` and `path`.
 *
 * @param {object} req
 * @param {string} path
 * @param {object} [options]
 * @return {SendStream}
 * @public
 */

function send(req: IncomingMessage, path: string, options?: SendOptions): SendStream {
  return new (SendStream as unknown as SendStreamConstructor)(req, path, options)
}

/**
 * Initialize a `SendStream` with the given `path`.
 *
 * @param {Request} req
 * @param {String} path
 * @param {object} [options]
 * @private
 */

function SendStream(this: SendStreamInit, req: IncomingMessage, path: string, options?: SendOptions) {
  Stream.call(this)

  var opts = options || {}

  this.options = opts
  this.path = path
  this.req = req

  this._acceptRanges = opts.acceptRanges !== undefined ? Boolean(opts.acceptRanges) : true

  this._cacheControl = opts.cacheControl !== undefined ? Boolean(opts.cacheControl) : true

  this._etag = opts.etag !== undefined ? Boolean(opts.etag) : true

  this._dotfiles = opts.dotfiles !== undefined ? opts.dotfiles : 'ignore'

  if (this._dotfiles !== 'ignore' && this._dotfiles !== 'allow' && this._dotfiles !== 'deny') {
    throw new TypeError('dotfiles option must be "allow", "deny", or "ignore"')
  }

  this._extensions = opts.extensions !== undefined ? normalizeList(opts.extensions, 'extensions option') : []

  this._immutable = opts.immutable !== undefined ? Boolean(opts.immutable) : false

  this._index = opts.index !== undefined ? normalizeList(opts.index, 'index option') : ['index.html']

  this._lastModified = opts.lastModified !== undefined ? Boolean(opts.lastModified) : true

  this._maxage = opts.maxAge || opts.maxage
  this._maxage = typeof this._maxage === 'string' ? ms(this._maxage as StringValue) : Number(this._maxage)
  this._maxage = !isNaN(this._maxage) ? Math.min(Math.max(0, this._maxage), MAX_MAXAGE) : 0

  this._root = opts.root ? resolve(opts.root) : null
}

/**
 * Inherits from `Stream`.
 */

util.inherits(SendStream, Stream)

/**
 * The prototype, typed (a function declaration's `prototype` is untyped).
 * @private
 */

const proto = SendStream.prototype as SendStream

/**
 * Emit error with `status`.
 *
 * @param {number} status
 * @param {Error} [err]
 * @private
 */

proto.error = function error(status, err): boolean | void {
  // emit if listeners instead of responding
  if (hasListeners(this, 'error')) {
    return this.emit('error', createHttpError(status, err))
  }

  var res = this.res
  // every caller passes a standard status (400, 403, 404, 412, 416 or 500)
  var msg = statuses.message[status]
  var doc = createHtmlDocument('Error', escapeHtml(msg))

  // clear existing headers
  clearHeaders(res)

  // add error headers
  if (err && err.headers) {
    setHeaders(res, err.headers)
  }

  // send basic response
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=UTF-8')
  res.setHeader('Content-Length', Buffer.byteLength(doc))
  res.setHeader('Content-Security-Policy', "default-src 'none'")
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(doc)
}

/**
 * Check if the pathname ends with "/".
 *
 * @return {boolean}
 * @private
 */

proto.hasTrailingSlash = function hasTrailingSlash() {
  return this.path[this.path.length - 1] === '/'
}

/**
 * Check if this is a conditional GET request.
 *
 * @return {Boolean}
 * @api private
 */

proto.isConditionalGET = function isConditionalGET() {
  return (
    this.req.headers['if-match'] ||
    this.req.headers['if-unmodified-since'] ||
    this.req.headers['if-none-match'] ||
    this.req.headers['if-modified-since']
  )
}

/**
 * Check if the request preconditions failed.
 *
 * @return {boolean}
 * @private
 */

proto.isPreconditionFailure = function isPreconditionFailure() {
  var req = this.req
  var res = this.res

  // if-match
  var match = req.headers['if-match']
  if (match) {
    var etag = res.getHeader('ETag')
    return (
      !etag ||
      (match !== '*' &&
        parseTokenList(match).every(function (match) {
          return match !== etag && match !== 'W/' + etag && 'W/' + match !== etag
        }))
    )
  }

  // if-unmodified-since
  var unmodifiedSince = parseHttpDate(req.headers['if-unmodified-since'])
  if (!isNaN(unmodifiedSince)) {
    var lastModified = parseHttpDate(res.getHeader('Last-Modified'))
    return isNaN(lastModified) || lastModified > unmodifiedSince
  }

  return false
}

/**
 * Strip various content header fields for a change in entity.
 *
 * @private
 */

proto.removeContentHeaderFields = function removeContentHeaderFields() {
  var res = this.res

  res.removeHeader('Content-Encoding')
  res.removeHeader('Content-Language')
  res.removeHeader('Content-Length')
  res.removeHeader('Content-Range')
  res.removeHeader('Content-Type')
}

/**
 * Respond with 304 not modified.
 *
 * @api private
 */

proto.notModified = function notModified() {
  var res = this.res
  debug('not modified')
  this.removeContentHeaderFields()
  res.statusCode = 304
  res.end()
}

/**
 * Raise error that headers already sent.
 *
 * @api private
 */

proto.headersAlreadySent = function headersAlreadySent() {
  var err = new Error("Can't set headers after they are sent.")
  debug('headers already sent')
  this.error(500, err)
}

/**
 * Check if the request is cacheable, aka
 * responded with 2xx or 304 (see RFC 2616 section 14.2{5,6}).
 *
 * @return {Boolean}
 * @api private
 */

proto.isCachable = function isCachable() {
  var statusCode = this.res.statusCode
  return (statusCode >= 200 && statusCode < 300) || statusCode === 304
}

/**
 * Handle stat() error.
 *
 * @param {Error} error
 * @private
 */

proto.onStatError = function onStatError(error) {
  switch (error.code) {
    case 'ENAMETOOLONG':
    case 'ENOENT':
    case 'ENOTDIR':
      this.error(404, error)
      break
    default:
      this.error(500, error)
      break
  }
}

/**
 * Check if the cache is fresh.
 *
 * @return {Boolean}
 * @api private
 */

proto.isFresh = function isFresh() {
  return fresh(this.req.headers, {
    etag: this.res.getHeader('ETag'),
    'last-modified': this.res.getHeader('Last-Modified')
  })
}

/**
 * Check if the range is fresh.
 *
 * @return {Boolean}
 * @api private
 */

proto.isRangeFresh = function isRangeFresh() {
  var ifRange = this.req.headers['if-range']

  if (!ifRange) {
    return true
  }

  // if-range as etag
  if (ifRange.indexOf('"') !== -1) {
    var etag = this.res.getHeader('ETag')
    return Boolean(etag && ifRange.indexOf(etag as string) !== -1)
  }

  // if-range as modified date
  var lastModified = this.res.getHeader('Last-Modified')
  return parseHttpDate(lastModified) <= parseHttpDate(ifRange)
}

/**
 * Redirect to path.
 *
 * @param {string} path
 * @private
 */

proto.redirect = function redirect(path) {
  var res = this.res

  if (hasListeners(this, 'directory')) {
    this.emit('directory', res, path)
    return
  }

  if (this.hasTrailingSlash()) {
    this.error(403)
    return
  }

  var loc = encodeUrl(collapseLeadingSlashes(this.path + '/'))
  var doc = createHtmlDocument('Redirecting', 'Redirecting to ' + escapeHtml(loc))

  // redirect
  res.statusCode = 301
  res.setHeader('Content-Type', 'text/html; charset=UTF-8')
  res.setHeader('Content-Length', Buffer.byteLength(doc))
  res.setHeader('Content-Security-Policy', "default-src 'none'")
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Location', loc)
  res.end(doc)
}

/**
 * Pipe to `res.
 *
 * @param {Stream} res
 * @return {Stream} res
 * @api public
 */

proto.pipe = function pipe(res) {
  // root path
  var root = this._root

  // references
  this.res = res as unknown as ServerResponse

  // decode the path
  var path = decode(this.path)
  if (path === -1) {
    this.error(400)
    return res
  }

  // null byte(s)
  if (~path.indexOf('\0')) {
    this.error(400)
    return res
  }

  var parts: string[]
  if (root !== null) {
    // normalize
    if (path) {
      path = normalize('.' + sep + path)
    }

    // malicious path
    if (UP_PATH_REGEXP.test(path)) {
      debug('malicious path "%s"', path)
      this.error(403)
      return res
    }

    // explode path parts
    parts = path.split(sep)

    // join / normalize from optional root dir
    path = normalize(join(root, path))
  } else {
    // ".." is malicious without "root"
    if (UP_PATH_REGEXP.test(path)) {
      debug('malicious path "%s"', path)
      this.error(403)
      return res
    }

    // explode path parts
    parts = normalize(path).split(sep)

    // resolve the path
    path = resolve(path)
  }

  // dotfile handling
  if (containsDotFile(parts)) {
    debug('%s dotfile "%s"', this._dotfiles, path)
    switch (this._dotfiles) {
      case 'allow':
        break
      case 'deny':
        this.error(403)
        return res
      case 'ignore':
      default:
        this.error(404)
        return res
    }
  }

  // index file support
  if (this._index.length && this.hasTrailingSlash()) {
    this.sendIndex(path)
    return res
  }

  this.sendFile(path)
  return res
}

/**
 * Transfer `path`.
 *
 * @param {String} path
 * @api public
 */

proto.send = function sendPath(path, stat, sizeUnknown) {
  var len = stat.size
  var options = this.options
  var opts: SendOptions = {}
  var res = this.res
  var req = this.req
  var ranges: string | undefined | RangeResult | Ranges = req.headers.range
  var offset = options.start || 0

  // A regular file that stats as 0 bytes may still have content: Linux /proc
  // and /sys files report 0 and are made as they're read (express#4944).
  // Node's fs.readFile() reads such a file to EOF for the same reason. Its
  // first byte tells the two apart: an empty file is sent as before, and one
  // with content is streamed to EOF with no Content-Length and no ranges.
  if (sizeUnknown === undefined && len === 0 && stat.isFile()) {
    var self = this
    hasContent(path, function onprobe(err, content) {
      if (err) return self.onStatError(err)
      self.send(path, stat, content)
    })
    return
  }

  if (res.headersSent) {
    // impossible to send now
    this.headersAlreadySent()
    return
  }

  debug('pipe "%s"', path)

  // set header fields. A 'headers' listener can throw (res.sendFile's
  // `headers` option with a CR or LF in a value, or serve-static's
  // `setHeaders`). This runs inside an fs.stat callback, where a throw would
  // be an uncaught exception that ends the process, so it becomes an error
  // for the 'error' listeners (or a 500 response) instead.
  try {
    this.setHeader(path, stat)
  } catch (err) {
    this.error(500, err as Error)
    return
  }

  // set content-type
  this.type(path)

  // conditional GET support
  if (this.isConditionalGET()) {
    if (this.isPreconditionFailure()) {
      this.error(412)
      return
    }

    if (this.isCachable() && this.isFresh()) {
      this.notModified()
      return
    }
  }

  // adjust len to start/end options
  len = Math.max(0, len - offset)
  if (options.end !== undefined) {
    var bytes = options.end - offset + 1
    if (len > bytes) len = bytes
  }

  // Range support (a file of unknown size is always sent whole, as RFC 9110
  // section 14.2 allows)
  if (!sizeUnknown && this._acceptRanges && BYTES_RANGE_REGEXP.test(ranges as string)) {
    // parse
    ranges = parseRange(len, ranges as string, {
      combine: true
    })

    // If-Range support
    if (!this.isRangeFresh()) {
      debug('range stale')
      ranges = -2
    }

    // unsatisfiable
    if (ranges === -1) {
      debug('range unsatisfiable')

      // Content-Range
      res.setHeader('Content-Range', contentRange('bytes', len))

      // 416 Requested Range Not Satisfiable
      return this.error(416, {
        headers: { 'Content-Range': res.getHeader('Content-Range') }
      })
    }

    // valid (syntactically invalid/multiple ranges are treated as a regular response)
    if (ranges !== -2 && ranges.length === 1) {
      debug('range %j', ranges)

      // Content-Range
      res.statusCode = 206
      res.setHeader('Content-Range', contentRange('bytes', len, ranges[0]))

      // adjust for requested range
      offset += (ranges[0] as Range).start
      len = (ranges[0] as Range).end - (ranges[0] as Range).start + 1
    }
  }

  // clone options
  for (var prop in options) {
    opts[prop] = options[prop]
  }

  // set read options
  opts.start = offset

  if (sizeUnknown) {
    // read to EOF (or to the end option); the body is chunked, or ends with
    // the connection
    res.removeHeader('Content-Length')
  } else {
    opts.end = Math.max(offset, offset + len - 1)

    // content-length
    res.setHeader('Content-Length', len)
  }

  // HEAD support
  if (req.method === 'HEAD') {
    res.end()
    return
  }

  this.stream(path, opts)
}

/**
 * Transfer file for `path`.
 *
 * @param {String} path
 * @api private
 */
proto.sendFile = function sendFile(path) {
  var i = 0
  var self = this

  debug('stat "%s"', path)
  fs.stat(path, function onstat(err, stat) {
    var pathEndsWithSep = path[path.length - 1] === sep
    if (err && err.code === 'ENOENT' && !extname(path) && !pathEndsWithSep) {
      // not found, check extensions
      return nextExtension(err)
    }
    if (err) return self.onStatError(err)
    if (stat.isDirectory()) return self.redirect(path)
    if (pathEndsWithSep) return self.error(404)
    self.emit('file', path, stat)
    self.send(path, stat)
  })

  function nextExtension(err?: NodeJS.ErrnoException) {
    if (self._extensions.length <= i) {
      return err ? self.onStatError(err) : self.error(404)
    }

    var p = path + '.' + self._extensions[i++]

    debug('stat "%s"', p)
    fs.stat(p, function (err, stat) {
      if (err) return nextExtension(err)
      if (stat.isDirectory()) return nextExtension()
      self.emit('file', p, stat)
      self.send(p, stat)
    })
  }
}

/**
 * Transfer index for `path`.
 *
 * @param {String} path
 * @api private
 */
proto.sendIndex = function sendIndex(path) {
  var i = -1
  var self = this

  function nextIndex(err?: NodeJS.ErrnoException) {
    if (++i >= self._index.length) {
      if (err) return self.onStatError(err)
      return self.error(404)
    }

    var p = join(path, self._index[i] as string)

    debug('stat "%s"', p)
    fs.stat(p, function (err, stat) {
      if (err) return nextIndex(err)
      if (stat.isDirectory()) return nextIndex()
      self.emit('file', p, stat)
      self.send(p, stat)
    })
  }

  nextIndex()
}

/**
 * Stream `path` to the response.
 *
 * @param {String} path
 * @param {Object} options
 * @api private
 */

proto.stream = function stream(path, options) {
  var self = this
  var res = this.res

  // pipe
  var stream = fs.createReadStream(path, options)
  this.emit('stream', stream)
  stream.pipe(res)

  // cleanup
  function cleanup() {
    stream.destroy()
  }

  // response finished, cleanup
  onFinished(res, cleanup)

  // error handling
  stream.on('error', function onerror(err) {
    // clean up stream early
    cleanup()

    // error
    self.onStatError(err)
  })

  // end
  stream.on('end', function onend() {
    self.emit('end')
  })
}

/**
 * Set content-type based on `path`
 * if it hasn't been explicitly set.
 *
 * @param {String} path
 * @api private
 */

proto.type = function type(path) {
  var res = this.res

  if (res.getHeader('Content-Type')) return

  var ext = extname(path)
  var type = mime.contentType(ext) || 'application/octet-stream'

  debug('content-type %s', type)
  res.setHeader('Content-Type', type)
}

/**
 * Set response header fields, most
 * fields may be pre-defined.
 *
 * @param {String} path
 * @param {Object} stat
 * @api private
 */

proto.setHeader = function setHeader(path, stat) {
  var res = this.res

  this.emit('headers', res, path, stat)

  if (this._acceptRanges && !res.getHeader('Accept-Ranges')) {
    debug('accept ranges')
    res.setHeader('Accept-Ranges', 'bytes')
  }

  if (this._cacheControl && !res.getHeader('Cache-Control')) {
    var cacheControl = 'public, max-age=' + Math.floor(this._maxage / 1000)

    if (this._immutable) {
      cacheControl += ', immutable'
    }

    debug('cache-control %s', cacheControl)
    res.setHeader('Cache-Control', cacheControl)
  }

  if (this._lastModified && !res.getHeader('Last-Modified')) {
    var modified = stat.mtime.toUTCString()
    debug('modified %s', modified)
    res.setHeader('Last-Modified', modified)
  }

  if (this._etag && !res.getHeader('ETag')) {
    var val = etag(stat)
    debug('etag %s', val)
    res.setHeader('ETag', val)
  }
}

/**
 * Clear all headers from a response.
 *
 * @param {object} res
 * @private
 */

function clearHeaders(res: ServerResponse): void {
  for (const header of res.getHeaderNames()) {
    res.removeHeader(header)
  }
}

/**
 * Collapse all leading slashes into a single slash
 *
 * @param {string} str
 * @private
 */
function collapseLeadingSlashes(str: string): string {
  for (var i = 0; i < str.length; i++) {
    if (str[i] !== '/') {
      break
    }
  }

  return i > 1 ? '/' + str.substr(i) : str
}

/**
 * Determine if path parts contain a dotfile.
 *
 * @api private
 */

function containsDotFile(parts: string[]): boolean {
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i] as string
    if (part.length > 1 && part[0] === '.') {
      return true
    }
  }

  return false
}

/**
 * Create a Content-Range header.
 *
 * @param {string} type
 * @param {number} size
 * @param {array} [range]
 */

function contentRange(type: string, size: number, range?: Range): string {
  return type + ' ' + (range ? range.start + '-' + range.end : '*') + '/' + size
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
 * Create a HttpError object from simple arguments.
 *
 * @param {number} status
 * @param {Error|object} err
 * @private
 */

function createHttpError(status: number, err?: (Error & SendErrorDetails) | SendErrorDetails) {
  if (!err) {
    return createError(status)
  }

  return err instanceof Error ? createError(status, err, { expose: false }) : createError(status, err)
}

/**
 * decodeURIComponent.
 *
 * Allows V8 to only deoptimize this fn instead of all
 * of send().
 *
 * @param {String} path
 * @api private
 */

function decode(path: string): string | -1 {
  try {
    return decodeURIComponent(path)
  } catch {
    return -1
  }
}

/**
 * Read the first byte of the file at `path`, and call back with whether there
 * was one.
 *
 * @param {string} path
 * @param {function} callback
 * @private
 */

function hasContent(path: string, callback: (err: NodeJS.ErrnoException | null, content: boolean) => void): void {
  fs.open(path, 'r', function onopen(err, fd) {
    if (err) return callback(err, false)
    fs.read(fd, Buffer.alloc(1), 0, 1, 0, function onread(err, bytesRead) {
      // a failed close leaves nothing to undo, and the read's answer stands
      fs.close(fd, function onclose() {
        callback(err, bytesRead > 0)
      })
    })
  })
}

/**
 * Determine if emitter has listeners of a given type.
 *
 * The way to do this check is done three different ways in Node.js >= 0.10
 * so this consolidates them into a minimal set using instance methods.
 *
 * @param {EventEmitter} emitter
 * @param {string} type
 * @returns {boolean}
 * @private
 */

function hasListeners(emitter: EventEmitter, type: string): boolean {
  return emitter.listenerCount(type) > 0
}

/**
 * Normalize the index option into an array.
 *
 * @param {boolean|string|array} val
 * @param {string} name
 * @private
 */

function normalizeList(val: string | string[] | false, name: string): string[] {
  var list = ([] as string[]).concat(val || [])

  for (var i = 0; i < list.length; i++) {
    if (typeof list[i] !== 'string') {
      throw new TypeError(name + ' must be array of strings or false')
    }
  }

  return list
}

/**
 * Parse an HTTP Date into a number.
 *
 * @param {string} date
 * @private
 */

function parseHttpDate(date: OutgoingHttpHeader | undefined): number {
  var timestamp = date && Date.parse(date as string)

  return typeof timestamp === 'number' ? timestamp : NaN
}

/**
 * Parse a HTTP token list.
 *
 * @param {string} str
 * @private
 */

function parseTokenList(str: string): string[] {
  var end = 0
  var list: string[] = []
  var start = 0

  // gather tokens
  for (var i = 0, len = str.length; i < len; i++) {
    switch (str.charCodeAt(i)) {
      case 0x20 /*   */:
        if (start === end) {
          start = end = i + 1
        }
        break
      case 0x2c /* , */:
        if (start !== end) {
          list.push(str.substring(start, end))
        }
        start = end = i + 1
        break
      default:
        end = i + 1
        break
    }
  }

  // final token
  if (start !== end) {
    list.push(str.substring(start, end))
  }

  return list
}

/**
 * Set an object of headers on a response.
 *
 * @param {object} res
 * @param {object} headers
 * @private
 */

function setHeaders(res: ServerResponse, headers: OutgoingHttpHeaders): void {
  var keys = Object.keys(headers)

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i] as string
    res.setHeader(key, headers[key] as OutgoingHttpHeader)
  }
}

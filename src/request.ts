/*!
 * express
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

import type { Accepts } from 'accepts'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type {
  Options as RangeParserOptions,
  Ranges as RangeParserRanges,
  Result as RangeParserResult
} from 'range-parser'
import type { Application } from './application'
import type { ExpressResponse } from './response'
import type { Params } from './router'
import type { Route } from './router/lib/route'

/**
 * Module dependencies.
 *
 * Loaded with `require` and typed with `typeof import(...)`, so the compiled
 * output calls them directly, with no interop helpers in between.
 * @private
 */

const accepts = require('accepts') as typeof import('accepts')
const isIP = (require('node:net') as typeof import('node:net')).isIP
const typeis = require('type-is') as typeof import('type-is')
const http = require('node:http') as typeof import('node:http')
const fresh = require('fresh') as typeof import('fresh')
const parseRange = require('range-parser') as typeof import('range-parser')
const parse = require('parseurl') as typeof import('parseurl')
const proxyaddr = require('proxy-addr') as typeof import('proxy-addr')

/**
 * The port of a Host header: digits only, possibly none (RFC 3986 section 3.2.3).
 * @private
 */

const PORT_REGEXP = /^[0-9]*$/

/** A `next` function: call it to pass control on, or with an error to skip to the error handlers. */
export type NextFunction = (err?: unknown) => void

/**
 * An Express request: Node's `IncomingMessage`, plus what this prototype
 * adds and what the application and router set on it.
 *
 * The `accepts*` methods have the overloads of the matching `accepts`
 * methods, which they call with their arguments unchanged.
 */
export interface Request extends IncomingMessage {
  /** The application, set on each application's request prototype. */
  app: Application
  /** The response, set by the application. */
  res: ExpressResponse
  /** The request target, which a server request always has; the routers rewrite it while they route. */
  url: string
  /** The router's `next` for the current layer. */
  next: NextFunction
  /** The path the current router is mounted at. */
  baseUrl: string
  /** `req.url` as it arrived, before the routers rewrote it. */
  originalUrl: string
  /** The route parameters of the current layer. */
  params: Params
  /** The route that matched, set by the router. */
  route?: Route
  /** The cookie secret, set by cookie-parser and read by `res.cookie()`. */
  secret?: string | undefined
  /** The socket, which is a TLS socket (with `encrypted` set) for HTTPS. */
  socket: Socket & { encrypted?: boolean }

  get(name: 'set-cookie'): string[] | undefined
  get(name: string): string | undefined
  header(name: 'set-cookie'): string[] | undefined
  header(name: string): string | undefined
  accepts: Accepts['types']
  acceptsEncodings: Accepts['encodings']
  acceptsCharsets: Accepts['charsets']
  acceptsLanguages: Accepts['languages']
  range(size: number, options?: RangeParserOptions): RangeParserResult | RangeParserRanges | undefined
  is(type: string | string[], ...types: string[]): string | false | null

  readonly query: object
  readonly protocol: string
  readonly secure: boolean
  readonly ip: string | undefined
  readonly ips: string[]
  readonly subdomains: string[]
  readonly path: string | null
  readonly host: string | undefined
  readonly hostname: string | undefined
  readonly fresh: boolean
  readonly stale: boolean
  readonly xhr: boolean
  /** Aborts when the client goes away before the response has finished. */
  readonly signal: AbortSignal
}

/**
 * Request prototype.
 * @public
 */

var req = Object.create(http.IncomingMessage.prototype) as Request

/**
 * Module exports.
 * @public
 */

module.exports = req

/**
 * Return request header.
 *
 * The `Referrer` header field is special-cased,
 * both `Referrer` and `Referer` are interchangeable.
 *
 * Examples:
 *
 *     req.get('Content-Type');
 *     // => "text/plain"
 *
 *     req.get('content-type');
 *     // => "text/plain"
 *
 *     req.get('Something');
 *     // => undefined
 *
 * Aliased as `req.header()`.
 *
 * @param {String} name
 * @return {String}
 * @public
 */

req.get = req.header = header

function header(this: Request, name: 'set-cookie'): string[] | undefined
function header(this: Request, name: string): string | undefined
function header(this: Request, name: string): string | string[] | undefined {
  if (!name) {
    throw new TypeError('name argument is required to req.get')
  }

  if (typeof name !== 'string') {
    throw new TypeError('name must be a string to req.get')
  }

  var lc = name.toLowerCase()

  switch (lc) {
    case 'referer':
    case 'referrer':
      return this.headers.referrer || this.headers.referer
    default:
      return this.headers[lc]
  }
}

/**
 * Check if the given `type(s)` is acceptable, returning
 * the best match when true, otherwise `false`, in which
 * case you should respond with 406 "Not Acceptable".
 *
 * The `type` value may be a single MIME type string
 * such as "application/json", an extension name
 * such as "json", an argument list such as `"json", "html", "text/plain"`,
 * or an array `["json", "html", "text/plain"]`. When a list
 * or array is given, the _best_ match, if any is returned.
 *
 * Examples:
 *
 *     // Accept: text/html
 *     req.accepts('html');
 *     // => "html"
 *
 *     // Accept: text/*, application/json
 *     req.accepts('html');
 *     // => "html"
 *     req.accepts('text/html');
 *     // => "text/html"
 *     req.accepts('json', 'text');
 *     // => "json"
 *     req.accepts('application/json');
 *     // => "application/json"
 *
 *     // Accept: text/*, application/json
 *     req.accepts('image/png');
 *     req.accepts('png');
 *     // => false
 *
 *     // Accept: text/*;q=.5, application/json
 *     req.accepts(['html', 'json']);
 *     req.accepts('html', 'json');
 *     // => "json"
 *
 * @param {String|Array} type(s)
 * @return {String|Array|Boolean}
 * @public
 */

req.accepts = function (this: Request, ...types: string[]) {
  var accept = accepts(this)
  return accept.types.apply(accept, types)
} as Request['accepts']

/**
 * Check if the given `encoding`s are accepted.
 *
 * @param {String} ...encoding
 * @return {String|Array}
 * @public
 */

req.acceptsEncodings = function (this: Request, ...encodings: string[]) {
  var accept = accepts(this)
  return accept.encodings.apply(accept, encodings)
} as Request['acceptsEncodings']

/**
 * Checks if the specified `charset`s are acceptable based on the request's `Accept-Charset` header.
 * Returns the best matching charset or an array of acceptable charsets.
 *
 * The `charset` argument(s) can be:
 * - A single charset string (e.g., "utf-8")
 * - Multiple charset strings as arguments (e.g., `"utf-8", "iso-8859-1"`)
 * - A comma-delimited list of charsets (e.g., `"utf-8, iso-8859-1"`)
 *
 * Examples:
 *
 *     // Accept-Charset: utf-8, iso-8859-1
 *     req.acceptsCharsets('utf-8');
 *     // => "utf-8"
 *
 *     req.acceptsCharsets('utf-8', 'iso-8859-1');
 *     // => "utf-8"
 *
 *     req.acceptsCharsets('utf-8, utf-16');
 *     // => "utf-8"
 *
 * @param {...String} charsets - The charset(s) to check against the `Accept-Charset` header.
 * @return {String|Array} - The best matching charset, or an array of acceptable charsets.
 * @public
 */

req.acceptsCharsets = function (this: Request, ...charsets: string[]) {
  const accept = accepts(this)
  return accept.charsets(...charsets)
} as Request['acceptsCharsets']

/**
 * Check if the given `lang`s are acceptable,
 * otherwise you should respond with 406 "Not Acceptable".
 *
 * @param {String} ...lang
 * @return {String|Array}
 * @public
 */

req.acceptsLanguages = function (this: Request, ...languages: string[]) {
  return accepts(this).languages(...languages)
} as Request['acceptsLanguages']

/**
 * Parse Range header field, capping to the given `size`.
 *
 * Unspecified ranges such as "0-" require knowledge of your resource length. In
 * the case of a byte range this is of course the total number of bytes. If the
 * Range header field is not given `undefined` is returned, `-1` when unsatisfiable,
 * and `-2` when syntactically invalid.
 *
 * When ranges are returned, the array has a "type" property which is the type of
 * range that is required (most commonly, "bytes"). Each array element is an object
 * with a "start" and "end" property for the portion of the range.
 *
 * The "combine" option can be set to `true` and overlapping & adjacent ranges
 * will be combined into a single range.
 *
 * NOTE: remember that ranges are inclusive, so for example "Range: users=0-3"
 * should respond with 4 users when available, not 3.
 *
 * @param {number} size
 * @param {object} [options]
 * @param {boolean} [options.combine=false]
 * @return {number|array}
 * @public
 */

req.range = function range(size, options) {
  var range = this.get('Range')
  if (!range) return
  return parseRange(size, range, options)
}

/**
 * Parse the query string of `req.url`.
 *
 * This uses the "query parser" setting to parse the raw
 * string into an object.
 *
 * @return {String}
 * @api public
 */

defineGetter(req, 'query', function query() {
  var queryparse = this.app.get('query parser fn')

  if (!queryparse) {
    // parsing is disabled
    return Object.create(null)
  }

  // parseurl leaves the query unparsed: a string, or null when there is none,
  // which the query parsers accept
  var querystring = parse(this)!.query as string

  return queryparse(querystring)
})

/**
 * Check if the incoming request contains the "Content-Type"
 * header field, and it contains the given mime `type`.
 *
 * Examples:
 *
 *      // With Content-Type: text/html; charset=utf-8
 *      req.is('html');
 *      req.is('text/html');
 *      req.is('text/*');
 *      // => true
 *
 *      // When Content-Type is application/json
 *      req.is('json');
 *      req.is('application/json');
 *      req.is('application/*');
 *      // => true
 *
 *      req.is('html');
 *      // => false
 *
 * @param {String|Array} types...
 * @return {String|false|null}
 * @public
 */

req.is = function is(types) {
  var arr = types

  // support flattened arguments
  if (!Array.isArray(types)) {
    arr = new Array<string>(arguments.length)
    for (var i = 0; i < arr.length; i++) {
      arr[i] = arguments[i]
    }
  }

  // an array either way, from the arguments or as given
  return typeis(this, arr as string[])
}

/**
 * Return the protocol string "http" or "https"
 * when requested with TLS. When the "trust proxy"
 * setting trusts the socket address, the
 * "X-Forwarded-Proto" header field will be trusted
 * and used if present.
 *
 * If you're running behind a reverse proxy that
 * supplies https for you this may be enabled.
 *
 * @return {String}
 * @public
 */

defineGetter(req, 'protocol', function protocol() {
  var proto = this.socket.encrypted ? 'https' : 'http'
  var trust = this.app.get('trust proxy fn')

  // the address is passed as is, even when the socket is closed and it is undefined
  if (!trust(this.socket.remoteAddress as string, 0)) {
    return proto
  }

  // Note: X-Forwarded-Proto is normally only ever a
  //       single value, but this is to be safe.
  var header = this.get('X-Forwarded-Proto') || proto
  var index = header.indexOf(',')

  // A URI scheme is case-insensitive (RFC 3986 section 3.1), so a proxy that
  // sends "HTTPS" means https, and req.secure must say so
  return (index !== -1 ? header.substring(0, index).trim() : header.trim()).toLowerCase()
})

/**
 * Short-hand for:
 *
 *    req.protocol === 'https'
 *
 * @return {Boolean}
 * @public
 */

defineGetter(req, 'secure', function secure() {
  return this.protocol === 'https'
})

/**
 * Return the remote address from the trusted proxy.
 *
 * This is the remote address on the socket unless
 * "trust proxy" is set.
 *
 * @return {String}
 * @public
 */

defineGetter(req, 'ip', function ip() {
  var trust = this.app.get('trust proxy fn')
  return proxyaddr(this, trust)
})

/**
 * When "trust proxy" is set, trusted proxy addresses + client.
 *
 * For example if the value were "client, proxy1, proxy2"
 * you would receive the array `["client", "proxy1", "proxy2"]`
 * where "proxy2" is the furthest down-stream and "proxy1" and
 * "proxy2" were trusted.
 *
 * @return {Array}
 * @public
 */

defineGetter(req, 'ips', function ips() {
  var trust = this.app.get('trust proxy fn')
  var addrs = proxyaddr.all(this, trust)

  // reverse the order (to farthest -> closest)
  // and remove socket address
  addrs.reverse().pop()

  return addrs
})

/**
 * Return subdomains as an array.
 *
 * Subdomains are the dot-separated parts of the host before the main domain of
 * the app. By default, the domain of the app is assumed to be the last two
 * parts of the host. This can be changed by setting "subdomain offset".
 *
 * For example, if the domain is "tobi.ferrets.example.com":
 * If "subdomain offset" is not set, req.subdomains is `["ferrets", "tobi"]`.
 * If "subdomain offset" is 3, req.subdomains is `["tobi"]`.
 *
 * @return {Array}
 * @public
 */

defineGetter(req, 'subdomains', function subdomains() {
  var hostname = this.hostname

  // A fully qualified name ends in the DNS root's empty label
  // ("tobi.example.com."), the same host as "tobi.example.com". Left in, the
  // empty label counts as a part and shifts every subdomain by one
  if (hostname?.endsWith('.')) hostname = hostname.slice(0, -1)

  if (!hostname) return []

  var offset = this.app.get('subdomain offset')

  // An IPv6 literal keeps its brackets in req.hostname, and net.isIP() needs
  // them gone, or "[::ffff:127.0.0.1]" is split on its dots
  var address = hostname[0] === '[' ? hostname.slice(1, -1) : hostname
  var subdomains = !isIP(address) ? hostname.split('.').reverse() : [hostname]

  return subdomains.slice(offset)
})

/**
 * Short-hand for `url.parse(req.url).pathname`.
 *
 * @return {String}
 * @public
 */

defineGetter(req, 'path', function path() {
  return parse(this)!.pathname
})

/**
 * Parse the "Host" header field to a host.
 *
 * When the "trust proxy" setting trusts the socket
 * address, the "X-Forwarded-Host" header field will
 * be trusted.
 *
 * Userinfo before an "@" is dropped, and a value whose
 * port is not all digits gives `undefined`.
 *
 * @return {String}
 * @public
 */

defineGetter(req, 'host', function host() {
  var trust = this.app.get('trust proxy fn')
  var val = this.get('X-Forwarded-Host')

  if (!val || !trust(this.socket.remoteAddress as string, 0)) {
    val = this.get('Host')
  } else if (val.indexOf(',') !== -1) {
    // Note: X-Forwarded-Host is normally only ever a
    //       single value, but this is to be safe.
    val = val.substring(0, val.indexOf(',')).trimEnd()
  }

  if (!val) return undefined

  // A host has no userinfo ("user@" or "user:pass@", RFC 3986 section 3.2.1),
  // and a client must not send it (RFC 9110 section 4.2.4). Without this,
  // "evil.example:x@good.example" gave req.hostname "evil.example". The host
  // is what follows the last "@".
  var at = val.lastIndexOf('@')
  if (at !== -1) val = val.substring(at + 1)

  // The port is digits only (RFC 3986 section 3.2.3). Anything else is not a
  // host, for example an encoded "@" in "evil.example:x%40good.example".
  var offset = val[0] === '[' ? val.indexOf(']') + 1 : 0
  var colon = val.indexOf(':', offset)
  if (colon !== -1 && !PORT_REGEXP.test(val.substring(colon + 1))) return undefined

  return val || undefined
})

/**
 * Parse the "Host" header field to a hostname.
 *
 * When the "trust proxy" setting trusts the socket
 * address, the "X-Forwarded-Host" header field will
 * be trusted.
 *
 * @return {String}
 * @api public
 */

defineGetter(req, 'hostname', function hostname() {
  var host = this.host

  if (!host) return

  // IPv6 literal support
  var offset = host[0] === '[' ? host.indexOf(']') + 1 : 0
  var index = host.indexOf(':', offset)

  return index !== -1 ? host.substring(0, index) : host
})

/**
 * Check if the request is fresh, aka
 * Last-Modified or the ETag
 * still match.
 *
 * @return {Boolean}
 * @public
 */

defineGetter(req, 'fresh', function () {
  var method = this.method
  var res = this.res
  var status = res.statusCode

  // GET, HEAD, or QUERY for weak freshness validation only
  if ('GET' !== method && 'HEAD' !== method && 'QUERY' !== method) return false

  // 2xx or 304 as per rfc2616 14.26
  if ((status >= 200 && status < 300) || 304 === status) {
    return fresh(this.headers, {
      etag: res.get('ETag'),
      'last-modified': res.get('Last-Modified')
    })
  }

  return false
})

/**
 * Check if the request is stale, aka
 * "Last-Modified" and / or the "ETag" for the
 * resource has changed.
 *
 * @return {Boolean}
 * @public
 */

defineGetter(req, 'stale', function stale() {
  return !this.fresh
})

/**
 * Check if the request was an _XMLHttpRequest_.
 *
 * @return {Boolean}
 * @public
 */

defineGetter(req, 'xhr', function xhr() {
  var val = this.get('X-Requested-With') || ''
  return val.toLowerCase() === 'xmlhttprequest'
})

/**
 * The request's AbortController, kept on the request itself so the signal is
 * the same whichever app's prototype the request has at the time.
 * @private
 */

const kAbortController = Symbol('express.abortController')

/**
 * An `AbortSignal` that aborts when the client goes away before the response
 * has finished, so a handler can pass it to `fetch`, a database driver or a
 * timer. It is created on first read (no listener otherwise), never aborts
 * once the response has finished, and is already aborted when read after
 * the client has gone. The reason is the default `AbortError` DOMException,
 * as for Node's own `IncomingMessage#signal`.
 *
 * Node 24.16 to 24.19 and 26.1 to 26.6 abort their own signal after every
 * response, finished or not (nodejs/node#64390), and Node 22 has none, so
 * Express defines it here, the same on every Node version. Assigning
 * `req.signal` sets an own property, as on Node 22 with Express 5.3.0.
 *
 * Not in Express 5.3.0.
 *
 * @return {AbortSignal}
 * @public
 */

Object.defineProperty(req, 'signal', {
  configurable: true,
  enumerable: false,
  get: function signal(this: Request & { [kAbortController]?: AbortController }) {
    var controller = this[kAbortController]
    if (controller) return controller.signal

    var res = this.res

    // No Express app has handled this request yet (for example in an
    // 'upgrade' or 'checkContinue' listener on an app.listen() server), so
    // there is no response to watch: read what Express 5.3.0 would, Node's
    // own signal (Node 24.16 and 26.1 added it), or undefined on Node 22
    if (!res) return Reflect.get(http.IncomingMessage.prototype, 'signal', this)

    var request = this
    var ac = new AbortController()
    this[kAbortController] = ac

    // a finished response never aborts, so nothing to listen for
    if (res.writableFinished) return ac.signal

    // the client went away before this first read
    if (request.socket.destroyed) {
      ac.abort()
      return ac.signal
    }

    // The response's 'close' comes after 'finish' when it finished, and on
    // its own when the connection closed first. The request's 'close' also
    // covers a pipelined request whose response is still queued, which gets
    // no 'close' on Node 22 when the connection closes. A request's 'close'
    // can come early, once its body is read, so the socket decides. Both
    // events fire once per request, so both listeners go away with it.
    var onclose = function onclose() {
      if (!res.writableFinished && request.socket.destroyed) ac.abort()
    }

    res.once('close', onclose)
    request.once('close', onclose)

    return ac.signal
  },
  // Assigning sets an own property, as it did on Node 22 with Express 5.3.0
  // (a polyfill middleware, for example), where IncomingMessage has no signal
  set: function setSignal(this: Request, value: unknown) {
    Object.defineProperty(this, 'signal', { configurable: true, enumerable: true, writable: true, value: value })
  }
})

/**
 * Helper function for creating a getter on an object.
 *
 * @param {Object} obj
 * @param {String} name
 * @param {Function} getter
 * @private
 */
function defineGetter<K extends keyof Request>(obj: Request, name: K, getter: (this: Request) => Request[K]): void {
  Object.defineProperty(obj, name, {
    configurable: true,
    enumerable: true,
    get: getter
  })
}

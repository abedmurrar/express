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
 * @api private
 */

import { Buffer } from 'node:buffer'
import { hash } from 'node:crypto'
import { METHODS } from 'node:http'
import querystring from 'node:querystring'

const contentType = require('content-type') as typeof import('content-type')
const mime = require('mime-types') as typeof import('mime-types')
const proxyaddr = require('proxy-addr') as typeof import('proxy-addr')
const qs = require('./qs') as import('./qs').Qs

/** A body ETag generator: the body and, for strings, its encoding. */
export type ETagFunction = (body: string | Buffer, encoding?: BufferEncoding) => string

/** A query string parser. */
export type QueryParser = (str: string) => object

/** A trust-proxy function: the address and its position in the chain. */
export type TrustFunction = (addr: string, i: number) => boolean

/** A media type with its quality and parameters, as parsed from an Accept-style value. */
export interface NormalizedType {
  value: string
  quality?: number
  params: Record<string, string>
}

/**
 * The HTTP methods Node supports, in lower case.
 * @api private
 */

export const methods: string[] = METHODS.map((method) => method.toLowerCase())

/**
 * Return a strong ETag for the given `body`.
 *
 * @param {String|Buffer} body
 * @param {String} [encoding]
 * @return {String}
 * @api private
 */

const etagStrong: ETagFunction = createETagGenerator({ weak: false })
export { etagStrong as etag }

/**
 * Return a weak ETag for the given `body`.
 *
 * @param {String|Buffer} body
 * @param {String} [encoding]
 * @return {String}
 * @api private
 */

export const wetag: ETagFunction = createETagGenerator({ weak: true })

/**
 * Normalize the given `type`, for example "html" becomes "text/html".
 *
 * @param {String} type
 * @return {Object}
 * @api private
 */

export function normalizeType(type: string): NormalizedType {
  return ~type.indexOf('/')
    ? acceptParams(type)
    : { value: mime.lookup(type) || 'application/octet-stream', params: {} }
}

/**
 * Normalize `types`, for example "html" becomes "text/html".
 *
 * @param {Array} types
 * @return {Array}
 * @api private
 */

export function normalizeTypes(types: string[]): NormalizedType[] {
  return types.map(normalizeType)
}

/**
 * Parse accept params `str` returning an
 * object with `.value`, `.quality` and `.params`.
 *
 * A parameter value may be a quoted string (RFC 9110 section 5.6.4), which
 * can itself contain ";", so a parameter ends at the next ";" outside quotes.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function acceptParams(str: string): NormalizedType {
  var length = str.length
  var colonIndex = str.indexOf(';')
  var index = colonIndex === -1 ? length : colonIndex
  var ret: NormalizedType & { quality: number } = { value: str.slice(0, index).trim(), quality: 1, params: {} }

  // the first "=" at or after the current parameter's start, kept across
  // parameters without one so the string is scanned once
  var splitIndex = -1

  while (index < length) {
    var start = index + 1
    index = paramEnd(str, start)

    if (splitIndex < start) splitIndex = str.indexOf('=', start)
    if (splitIndex === -1) break
    // a parameter without "=" is skipped
    if (splitIndex > index) continue

    var key = str.slice(start, splitIndex).trim()
    var value = str.slice(splitIndex + 1, index).trim()

    if (key === 'q') {
      ret.quality = parseFloat(value)
    } else {
      ret.params[key] = value
    }
  }

  return ret
}

/**
 * The index of the first ";" at or after `from` that is not inside a quoted
 * string, or the length of `str` when there is none. Inside quotes a
 * backslash escapes the next character (a quoted-pair), so `\"` doesn't end
 * the string and `\\"` does.
 *
 * @param {String} str
 * @param {Number} from
 * @return {Number}
 * @api private
 */

function paramEnd(str: string, from: number): number {
  var quoted = false

  for (var i = from; i < str.length; i++) {
    var c = str[i]

    if (quoted) {
      if (c === '\\') {
        i++
      } else if (c === '"') {
        quoted = false
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ';') {
      return i
    }
  }

  return str.length
}

/**
 * Compile "etag" value to function.
 *
 * @param  {Boolean|String|Function} val
 * @return {Function}
 * @api private
 */

export function compileETag(val: unknown): ETagFunction | undefined {
  var fn: ETagFunction | undefined

  if (typeof val === 'function') {
    return val as ETagFunction
  }

  switch (val) {
    case true:
    case 'weak':
      fn = wetag
      break
    case false:
      break
    case 'strong':
      fn = etagStrong
      break
    default:
      throw new TypeError('unknown value for etag function: ' + String(val))
  }

  return fn
}

/**
 * Compile "query parser" value to function.
 *
 * @param  {String|Function} val
 * @return {Function}
 * @api private
 */

export function compileQueryParser(val: unknown): QueryParser | undefined {
  var fn: QueryParser | undefined

  if (typeof val === 'function') {
    return val as QueryParser
  }

  switch (val) {
    case true:
    case 'simple':
      fn = querystring.parse
      break
    case false:
      break
    case 'extended':
      fn = parseExtendedQueryString
      break
    default:
      throw new TypeError('unknown value for query parser function: ' + String(val))
  }

  return fn
}

/**
 * Compile "proxy trust" value to function.
 *
 * @param  {Boolean|String|Number|Array|Function} val
 * @return {Function}
 * @api private
 */

export function compileTrust(val: unknown): TrustFunction {
  if (typeof val === 'function') return val as TrustFunction

  if (val === true) {
    // Support plain true/false
    return function () {
      return true
    }
  }

  if (typeof val === 'number') {
    // Support trusting hop count
    return function (a, i) {
      return i < val
    }
  }

  return compileTrustList(val)
}

/**
 * Compile a trust list (a comma-separated string, an array, or nothing) with
 * proxy-addr. A non-empty list is wrapped so each address's decision is
 * remembered: proxy-addr's compiled function parses the address and matches
 * it against every subnet on each call (several microseconds for a list like
 * "loopback, 10.0.0.0/8"), and its result depends only on the address.
 * Kept out of compileTrust so V8 names its anonymous functions as before.
 *
 * @param {String|Array} val
 * @return {Function}
 * @private
 */

function compileTrustList(val: unknown): TrustFunction {
  // Support comma-separated values
  var subnets = (
    typeof val === 'string'
      ? val.split(',').map(function (v) {
          return v.trim()
        })
      : val || []
  ) as string | string[]
  var compiled = proxyaddr.compile(subnets)

  // @types/proxy-addr declares (addr, i), but the compiled function only
  // reads the address (trustSingle and trustMulti take one parameter)
  return subnets.length > 0 ? rememberTrust(compiled as (addr: string) => boolean) : compiled
}

/**
 * Remember a compiled trust function's decisions by address, in a map of at
 * most TRUST_CACHE_LIMIT entries that is emptied when full. One map per
 * compiled function, so apps with different settings never share one. The
 * limit is higher than the content-type caches because client addresses
 * vary per request, while the proxies' own addresses repeat.
 *
 * @param {Function} compiled
 * @return {Function}
 * @private
 */

const TRUST_CACHE_LIMIT = 1000

function rememberTrust(compiled: (addr: string) => boolean): TrustFunction {
  var decisions = new Map<string, boolean>()

  return function trust(addr: string): boolean {
    var decision = decisions.get(addr)

    if (decision === undefined) {
      decision = compiled(addr)
      if (decisions.size >= TRUST_CACHE_LIMIT) {
        decisions.clear()
      }
      decisions.set(addr, decision)
    }

    return decision
  }
}

/**
 * Set the charset in a given Content-Type string.
 *
 * @param {String} type
 * @param {String} charset
 * @return {String}
 * @api private
 */

export function setCharset(type: string, charset: string | undefined): string
export function setCharset(type: string | undefined, charset: string | undefined): string | undefined
export function setCharset(type: string | undefined, charset: string | undefined): string | undefined {
  if (!type || !charset) {
    return type
  }

  var byType = setCharsetCache.get(charset)
  var formatted = byType && byType.get(type)

  if (formatted === undefined) {
    // parse type (throws on an invalid type, before anything is cached)
    var parsed = contentType.parse(type)

    // set charset
    parsed.parameters.charset = charset

    // format type
    formatted = contentType.format(parsed)

    if (byType === undefined) {
      byType = new Map()
      remember(setCharsetCache, charset, byType)
    }
    remember(byType, type, formatted)
  }

  return formatted
}

/**
 * `mime.contentType`, remembered by its input: a response sets one of a
 * handful of types, and each lookup through the mime database costs a few
 * hundred nanoseconds. `false` (an unknown type) is remembered too.
 *
 * @param {String} value
 * @return {String|false}
 * @api private
 */

export function mimeContentType(value: string): string | false {
  var resolved = mimeContentTypeCache.get(value)

  if (resolved === undefined) {
    resolved = remember(mimeContentTypeCache, value, mime.contentType(value))
  }

  return resolved
}

/**
 * The memo caches for setCharset and mimeContentType, ported from upstream
 * PR #7481 (Nigro Simone). setCharset keeps one map of type to result per
 * charset, since a key joining the two strings would be hashed again on
 * every call. Each map holds at most CACHE_LIMIT entries and is emptied when
 * full, so types taken from requests can't grow them without bound.
 * @private
 */

const CACHE_LIMIT = 100
const setCharsetCache = new Map<string, Map<string, string>>()
const mimeContentTypeCache = new Map<string, string | false>()

function remember<V>(cache: Map<string, V>, key: string, value: V): V {
  if (cache.size >= CACHE_LIMIT) {
    cache.clear()
  }
  cache.set(key, value)
  return value
}

/**
 * Create an ETag generator function, generating ETags with
 * the given options.
 *
 * @param {object} options
 * @return {function}
 * @private
 */

function createETagGenerator(options: { weak: boolean }): ETagFunction {
  var prefix = options.weak ? 'W/' : ''

  return function generateETag(body, encoding) {
    // UTF-8 strings are hashed as they are, which skips copying them into a
    // Buffer first; crypto.hash encodes strings as UTF-8 exactly as
    // Buffer.from does. Other encodings still go through a Buffer.
    if (typeof body === 'string' && (encoding === undefined || encoding === 'utf8' || encoding === 'utf-8')) {
      return prefix + entityTag(body, Buffer.byteLength(body, 'utf8'))
    }

    var buf = !Buffer.isBuffer(body) ? Buffer.from(body, encoding) : body

    return prefix + entityTag(buf, buf.length)
  }
}

/**
 * The entity tag of `etag` 1.8.1 for a body: its byte length in hex and the
 * first 27 characters of its base64 SHA-1, in quotes. The same output, through
 * Node's one-shot crypto.hash() instead of createHash().update().digest().
 *
 * @param {String|Buffer} entity
 * @param {Number} length the entity's length in bytes
 * @return {String}
 * @private
 */

function entityTag(entity: string | Buffer, length: number): string {
  if (length === 0) {
    // the SHA-1 of an empty body
    return '"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk"'
  }

  return '"' + length.toString(16) + '-' + hash('sha1', entity, 'base64').substring(0, 27) + '"'
}

/**
 * Parse an extended query string with qs.
 *
 * A flat query string (no "[" or "]", and none of their escapes) is parsed
 * by `parseFlatQueryString`, which gives exactly what qs gives; anything else
 * goes to qs.
 *
 * @param {String} str
 * @return {Object}
 * @private
 */

function parseExtendedQueryString(str: string | null | undefined): object {
  if (str === null || str === undefined) {
    // parseurl gives null for a URL with no "?"; qs returns a new {} for it
    return {}
  }

  if (typeof str === 'string' && !QS_NESTING.test(str)) {
    var flat = parseFlatQueryString(str)
    if (flat !== undefined) return flat
  }

  return qs.parse(str, {
    allowPrototypes: true
  })
}

/**
 * What makes qs read a query string as more than flat `key=value` pairs, with
 * Express's options: a "[" or "]" (qs nests keys on brackets, and splits a
 * pair at "]=" before its first "="), and "%5B" or "%5D" in either case,
 * which qs turns into brackets before it splits or decodes anything. Dots
 * only nest with `allowDots`, and commas with `comma`, which are both off.
 */

const QS_NESTING = /[[\]]|%5[bd]/i

/** qs's default `parameterLimit` and `arrayLimit`. */
const QS_PARAMETER_LIMIT = 1000
const QS_ARRAY_LIMIT = 20

/**
 * Parse a flat query string the way `qs.parse(str, { allowPrototypes: true })`
 * does, or return undefined when a key has more values than qs puts in an
 * array (qs then gives an object with numeric keys, so qs parses it instead).
 *
 * As in qs 6.17.1 (lib/parse.js): only the first 1,000 "&"-separated parts
 * count, including empty ones; a pair splits at its first "="; a part with
 * no "=" has the value ""; keys and values are decoded the same way; an empty
 * key and a `__proto__` key are dropped; a repeated key collects its values
 * in an array; and the result is a plain object with keys in qs's order.
 *
 * @param {String} str
 * @return {Object|undefined}
 * @private
 */

function parseFlatQueryString(str: string): Record<string, string | string[]> | undefined {
  var result: Record<string, string | string[]> = {}
  var length = str.length
  var start = 0
  // the first "=" at or after `start`, or -1 when there is none; found again
  // only once a part has gone past it, so the whole string is scanned once
  var eq = str.indexOf('=')

  // what str.split('&', QS_PARAMETER_LIMIT) gives, without making the parts
  for (var parts = 0; parts < QS_PARAMETER_LIMIT; parts++) {
    var end = str.indexOf('&', start)
    if (end === -1) end = length
    if (eq !== -1 && eq < start) eq = str.indexOf('=', start)

    var pair = eq !== -1 && eq < end
    var key = decodeQueryComponent(str.slice(start, pair ? eq : end))

    if (key !== '' && key !== '__proto__') {
      var value = pair ? decodeQueryComponent(str.slice(eq + 1, end)) : ''
      var existing = Object.hasOwn(result, key) ? result[key] : undefined

      if (existing === undefined) {
        result[key] = value
      } else if (typeof existing === 'string') {
        result[key] = [existing, value]
      } else if (existing.length < QS_ARRAY_LIMIT) {
        existing.push(value)
      } else {
        return undefined
      }
    }

    if (end === length) break
    start = end + 1
  }

  return result
}

/**
 * Decode a query string key or value as qs's default decoder does for UTF-8:
 * "+" is a space, and the rest is decoded with `decodeURIComponent`, or left
 * as it is (with "+" still a space) if that throws on a malformed escape.
 *
 * @param {String} str
 * @return {String}
 * @private
 */

function decodeQueryComponent(str: string): string {
  if (str.indexOf('%') === -1) {
    return str.indexOf('+') === -1 ? str : str.replace(/\+/g, ' ')
  }

  var spaced = str.replace(/\+/g, ' ')
  try {
    return decodeURIComponent(spaced)
  } catch {
    return spaced
  }
}

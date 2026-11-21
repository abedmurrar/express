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
const qs = require('qs') as typeof import('qs')

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
 * @param {String} str
 * @return {Object}
 * @api private
 */

function acceptParams(str: string): NormalizedType {
  var length = str.length
  var colonIndex = str.indexOf(';')
  var index = colonIndex === -1 ? length : colonIndex
  var ret: NormalizedType & { quality: number } = { value: str.slice(0, index).trim(), quality: 1, params: {} }

  while (index < length) {
    var splitIndex = str.indexOf('=', index)
    if (splitIndex === -1) break

    colonIndex = str.indexOf(';', index)
    var endIndex = colonIndex === -1 ? length : colonIndex

    if (splitIndex > endIndex) {
      index = str.lastIndexOf(';', splitIndex - 1) + 1
      continue
    }

    var key = str.slice(index, splitIndex).trim()
    var value = str.slice(splitIndex + 1, endIndex).trim()

    if (key === 'q') {
      ret.quality = parseFloat(value)
    } else {
      ret.params[key] = value
    }

    index = endIndex + 1
  }

  return ret
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

  // Support comma-separated values
  return proxyaddr.compile(
    (typeof val === 'string'
      ? val.split(',').map(function (v) {
          return v.trim()
        })
      : val || []) as string | string[]
  )
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
 * @param {String} str
 * @return {Object}
 * @private
 */

function parseExtendedQueryString(str: string): object {
  return qs.parse(str, {
    allowPrototypes: true
  })
}

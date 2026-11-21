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
import { METHODS } from 'node:http'
import querystring from 'node:querystring'

const contentType = require('content-type') as typeof import('content-type')
const etag = require('etag') as typeof import('etag')
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

  // parse type
  var parsed = contentType.parse(type)

  // set charset
  parsed.parameters.charset = charset

  // format type
  return contentType.format(parsed)
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
  return function generateETag(body, encoding) {
    var buf = !Buffer.isBuffer(body) ? Buffer.from(body, encoding) : body

    return etag(buf, options)
  }
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

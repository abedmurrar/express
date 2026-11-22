/*!
 * body-parser
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 *
 * Loaded with `require` and typed with `typeof import(...)` or the type the
 * file exports for its `module.exports`, so the compiled output calls them
 * directly, with no interop helpers in between. `qs` is our copy in `src/qs`.
 * @private
 */

const createError = require('http-errors') as typeof import('http-errors')
const debug = (require('debug') as typeof import('debug'))('body-parser:urlencoded')
const read = require('../read') as ReadFunction
const qs = require('../../../qs') as Qs
const { normalizeOptions } = require('../utils') as Utils

import type { ParseOptions, Qs } from '../../../qs'
import type { BodyParserHandler, ReadFunction } from '../read'
import type { BodyParserOptions, Utils } from '../utils'

/** `urlencoded()` options. */
export interface UrlencodedOptions extends BodyParserOptions {
  /** parse with qs (nested objects and arrays) instead of one level of keys */
  extended?: boolean | undefined
  /** the maximum number of parameters, defaulting to 1000 (413 beyond it) */
  parameterLimit?: number | undefined
  /** let a `utf8=✓` parameter choose the charset */
  charsetSentinel?: boolean | undefined
  /** decode numeric entities such as `&#9786;` in an iso-8859-1 form */
  interpretNumericEntities?: boolean | undefined
  /** qs's maximum depth when `extended` is true, defaulting to 32 */
  depth?: number | undefined
}

/** `urlencoded()` itself. */
export type UrlencodedFunction = (options?: UrlencodedOptions | null) => BodyParserHandler

/**
 * Module exports.
 */

module.exports = urlencoded

/**
 * Create a middleware to parse urlencoded bodies.
 *
 * @param {Object} [options]
 * @returns {Function}
 * @public
 */
function urlencoded(options?: UrlencodedOptions | null): BodyParserHandler {
  const normalizedOptions = normalizeOptions(options, 'application/x-www-form-urlencoded')

  if (normalizedOptions.defaultCharset !== 'utf-8' && normalizedOptions.defaultCharset !== 'iso-8859-1') {
    throw new TypeError('option defaultCharset must be either utf-8 or iso-8859-1')
  }

  // create the appropriate query parser
  const parse = createQueryParser(options)

  const readOptions = {
    ...normalizedOptions,
    // assert charset
    isValidCharset: (charset: string) => charset === 'utf-8' || charset === 'iso-8859-1'
  }

  return function urlencodedParser(req, res, next) {
    read(req, res, next, parse, debug, readOptions)
  }
}

/**
 * Get the extended query parser.
 *
 * @param {Object} options
 * @returns {Function}
 * @private
 */
function createQueryParser(options?: UrlencodedOptions | null): (body: string, encoding: string) => object {
  const extended = Boolean(options?.extended)
  let parameterLimit = options?.parameterLimit !== undefined ? options?.parameterLimit : 1000
  const charsetSentinel = options?.charsetSentinel
  const interpretNumericEntities = options?.interpretNumericEntities
  const depth = extended ? (options?.depth !== undefined ? options?.depth : 32) : 0

  if (isNaN(parameterLimit) || parameterLimit < 1) {
    throw new TypeError('option parameterLimit must be a positive number')
  }

  if (isNaN(depth) || depth < 0) {
    throw new TypeError('option depth must be a zero or a positive number')
  }

  if (isFinite(parameterLimit)) {
    parameterLimit = parameterLimit | 0
  }

  return function parse(body, encoding) {
    if (!body.length) return {}

    const paramCount = parameterCount(body, parameterLimit)

    if (paramCount === undefined) {
      debug('too many parameters')
      throw createError(413, 'too many parameters', {
        type: 'parameters.too.many'
      })
    }

    const arrayLimit = extended ? Math.max(100, paramCount) : paramCount

    debug('parse ' + (extended ? 'extended ' : '') + 'urlencoding')
    try {
      return qs.parse(body, {
        allowPrototypes: true,
        arrayLimit,
        depth,
        charsetSentinel,
        interpretNumericEntities,
        charset: encoding as ParseOptions['charset'],
        parameterLimit,
        strictDepth: true
      })
    } catch (err) {
      if (err instanceof RangeError) {
        throw createError(400, 'The input exceeded the depth', {
          type: 'querystring.parse.rangeError'
        })
      } else {
        throw err
      }
    }
  }
}

/**
 * Count the number of parameters, stopping once limit reached
 *
 * @param {string} body
 * @param {number} limit
 * @returns {number|undefined} Returns undefined if limit exceeded
 * @private
 */
function parameterCount(body: string, limit: number): number | undefined {
  let count = 0
  let index = -1
  do {
    count++
    if (count > limit) return undefined // Early exit if limit exceeded
    index = body.indexOf('&', index + 1)
  } while (index !== -1)
  return count
}

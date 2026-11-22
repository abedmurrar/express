/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 *
 * Loaded with `require` and typed with `typeof import(...)` or the type the
 * file exports for its `module.exports`, so the compiled output calls them
 * directly, with no interop helpers in between.
 */

const debug = (require('debug') as typeof import('debug'))('body-parser:raw')
const read = require('../read') as ReadFunction
const { normalizeOptions, passthrough } = require('../utils') as Utils

import type { BodyParserHandler, ReadFunction } from '../read'
import type { BodyParserOptions, Utils } from '../utils'

/** `raw()` options: the common ones (its charset is ignored). */
export type RawOptions = BodyParserOptions

/** `raw()` itself. */
export type RawFunction = (options?: RawOptions | null) => BodyParserHandler

/**
 * Module exports.
 */

module.exports = raw

/**
 * Create a middleware to parse raw bodies.
 *
 * @param {Object} [options]
 * @returns {Function}
 * @public
 */
function raw(options?: RawOptions | null): BodyParserHandler {
  const normalizedOptions = normalizeOptions(options, 'application/octet-stream')

  const readOptions = {
    ...normalizedOptions,
    // Skip charset validation and parse the body as is
    skipCharset: true
  }

  return function rawParser(req, res, next) {
    read(req, res, next, passthrough, debug, readOptions)
  }
}

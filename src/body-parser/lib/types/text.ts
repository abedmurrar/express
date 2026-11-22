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

const debug = (require('debug') as typeof import('debug'))('body-parser:text')
const read = require('../read') as ReadFunction
const { normalizeOptions, passthrough } = require('../utils') as Utils

import type { BodyParserHandler, ReadFunction } from '../read'
import type { BodyParserOptions, Utils } from '../utils'

/** `text()` options: the common ones. */
export type TextOptions = BodyParserOptions

/** `text()` itself. */
export type TextFunction = (options?: TextOptions | null) => BodyParserHandler

/**
 * Module exports.
 */

module.exports = text

/**
 * Create a middleware to parse text bodies.
 *
 * @param {Object} [options]
 * @returns {Function}
 * @public
 */
function text(options?: TextOptions | null): BodyParserHandler {
  const normalizedOptions = normalizeOptions(options, 'text/plain')

  return function textParser(req, res, next) {
    read(req, res, next, passthrough, debug, normalizedOptions)
  }
}

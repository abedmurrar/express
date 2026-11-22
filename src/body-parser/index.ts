/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

import type { JsonFunction } from './lib/types/json'
import type { RawFunction } from './lib/types/raw'
import type { TextFunction } from './lib/types/text'
import type { UrlencodedFunction } from './lib/types/urlencoded'

export type { BodyParserHandler, BodyParserNext, BodyParserRequest } from './lib/read'
export type { JsonFunction, JsonOptions } from './lib/types/json'
export type { RawFunction, RawOptions } from './lib/types/raw'
export type { TextFunction, TextOptions } from './lib/types/text'
export type { UrlencodedFunction, UrlencodedOptions } from './lib/types/urlencoded'
export type { BodyParserOptions, VerifyFunction } from './lib/utils'

/** What `require('./body-parser')` returns: the deprecated `bodyParser()`, with the four parsers on it. */
export interface BodyParser {
  (): never
  json: JsonFunction
  raw: RawFunction
  text: TextFunction
  urlencoded: UrlencodedFunction
}

/**
 * @typedef {Object} Parsers
 * @property {Function} json JSON parser
 * @property {Function} raw Raw parser
 * @property {Function} text Text parser
 * @property {Function} urlencoded URL-encoded parser
 */

/**
 * Module exports.
 * @type {Function & Parsers}
 */
exports = module.exports = bodyParser

/**
 * JSON parser.
 * @public
 */
exports.json = require('./lib/types/json') as JsonFunction

/**
 * Raw parser.
 * @public
 */
exports.raw = require('./lib/types/raw') as RawFunction

/**
 * Text parser.
 * @public
 */
exports.text = require('./lib/types/text') as TextFunction

/**
 * URL-encoded parser.
 * @public
 */
exports.urlencoded = require('./lib/types/urlencoded') as UrlencodedFunction

/**
 * Create a middleware to parse json and urlencoded bodies.
 *
 * @deprecated
 * @public
 */
function bodyParser(): never {
  throw new Error('The bodyParser() generic has been split into individual middleware to use instead.')
}

'use strict'

/**
 * Module dependencies.
 *
 * Loaded with `require` and typed with the type each file exports for its
 * `module.exports`, so the compiled output calls them directly, with no
 * interop helpers in between.
 * @private
 */

var stringify = require('./stringify') as StringifyFunction
var parse = require('./parse') as ParseFunction
var formats = require('./formats') as Formats

import type { Formats } from './formats'
import type { ParseFunction } from './parse'
import type { StringifyFunction } from './stringify'

export type { FormatName, Formats, Formatter } from './formats'
export type { Decoder, ParsedQs, ParseFunction, ParseOptions } from './parse'
export type { Encoder, StringifyFunction, StringifyOptions } from './stringify'

/** What `require('./qs')` returns. */
export interface Qs {
  formats: Formats
  parse: ParseFunction
  stringify: StringifyFunction
}

module.exports = {
  formats: formats,
  parse: parse,
  stringify: stringify
} satisfies Qs

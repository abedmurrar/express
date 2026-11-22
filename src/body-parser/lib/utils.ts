'use strict'

/**
 * Module dependencies.
 *
 * Loaded with `require` and typed with `typeof import(...)`, so the compiled
 * output calls them directly, with no interop helpers in between.
 */

const bytes = require('bytes') as typeof import('bytes')
const typeis = require('type-is') as typeof import('type-is')

import type { Buffer } from 'node:buffer'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Decides whether a request is parsed: `type-is`'s check for the `type` option, or the `type` function itself. */
export type ShouldParse = (req: IncomingMessage) => unknown

/** The `verify` option, called as `verify(req, res, buf, encoding)` before the body is parsed. */
export type VerifyFunction = (req: IncomingMessage, res: ServerResponse, buf: Buffer, encoding: string | null) => void

/** The options every parser takes. */
export interface BodyParserOptions {
  /** inflate deflated, gzipped, brotli and zstd bodies, defaulting to true */
  inflate?: boolean | undefined
  /** the maximum body size, in bytes or as a `bytes` string, defaulting to 100kb */
  limit?: number | string | null | undefined
  /** the media type(s) to parse, or a function deciding it */
  type?: string | string[] | ShouldParse | undefined
  /** called before parsing, to check the raw body */
  verify?: VerifyFunction | false | undefined
  /** the charset when the request names none, defaulting to utf-8 */
  defaultCharset?: string | undefined
}

/** What `normalizeOptions` returns. */
export interface NormalizedOptions {
  inflate: boolean
  limit: number
  verify: VerifyFunction | false
  defaultCharset: string
  shouldParse: ShouldParse
}

/** What `require('./utils')` returns. */
export interface Utils {
  normalizeOptions: typeof normalizeOptions
  passthrough: typeof passthrough
}

/**
 * Module exports.
 */
module.exports = {
  normalizeOptions,
  passthrough
} satisfies Utils

/**
 * Get the simple type checker.
 *
 * @param {string | string[]} type
 * @returns {Function}
 * @private
 */
function typeChecker(type: string | string[]): ShouldParse {
  return function checkType(req) {
    return Boolean(typeis(req, type as string[]))
  }
}

/**
 * Normalizes the common options for all parsers.
 *
 * @param {Object} options options to normalize
 * @param {string | string[] | Function} defaultType default content type(s) or a function to determine it
 * @returns {Object}
 * @private
 */
function normalizeOptions(
  options: BodyParserOptions | null | undefined,
  defaultType: string | string[] | ShouldParse
): NormalizedOptions {
  if (!defaultType) {
    // Parsers must define a default content type
    throw new TypeError('defaultType must be provided')
  }

  const inflate = options?.inflate !== false
  const limit =
    typeof options?.limit === 'undefined' || options?.limit === null
      ? 102400 // 100kb default
      : bytes.parse(options.limit)
  const type = options?.type || defaultType
  const verify = options?.verify || false
  const defaultCharset = options?.defaultCharset || 'utf-8'

  if (limit === null) {
    throw new TypeError(`option limit "${String((options as BodyParserOptions).limit)}" is invalid`)
  }

  if (verify !== false && typeof verify !== 'function') {
    throw new TypeError('option verify must be function')
  }

  // create the appropriate type checking function
  const shouldParse = typeof type !== 'function' ? typeChecker(type) : type

  return {
    inflate,
    limit,
    verify,
    defaultCharset,
    shouldParse
  }
}

/**
 * Passthrough function that returns input unchanged.
 * Used by parsers that don't need to transform the data.
 *
 * @param {*} value
 * @returns {*}
 * @private
 */
function passthrough<T>(value: T): T {
  return value
}

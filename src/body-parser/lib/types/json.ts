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
 * directly, with no interop helpers in between.
 * @private
 */

const debug = (require('debug') as typeof import('debug'))('body-parser:json')
const read = require('../read') as ReadFunction
const { normalizeOptions } = require('../utils') as Utils

import type { BodyParserHandler, ReadFunction } from '../read'
import type { BodyParserOptions, Utils } from '../utils'

/** `json()` options. */
export interface JsonOptions extends BodyParserOptions {
  /** passed to `JSON.parse` as its second argument */
  reviver?: ((this: unknown, key: string, value: unknown) => unknown) | undefined
  /** accept only objects and arrays, defaulting to true */
  strict?: boolean | undefined
}

/** `json()` itself. */
export type JsonFunction = (options?: JsonOptions | null) => BodyParserHandler

/**
 * Module exports.
 */

module.exports = json

/**
 * RegExp to match the first non-whitespace character in a string.
 *
 * Allowed whitespace is defined in RFC 7159:
 *
 *    ws = *(
 *            %x20 /              ; Space
 *            %x09 /              ; Horizontal tab
 *            %x0A /              ; Line feed or New line
 *            %x0D )              ; Carriage return
 */
const FIRST_NON_WHITESPACE_REGEXP = /^[\x20\x09\x0a\x0d]*([^\x20\x09\x0a\x0d]|$)/ // eslint-disable-line no-control-regex

const JSON_SYNTAX_CHAR = '#'
const JSON_SYNTAX_REGEXP = /#+/g

/**
 * Create a middleware to parse JSON bodies.
 *
 * @param {Object} [options]
 * @returns {Function}
 * @public
 */
function json(options?: JsonOptions | null): BodyParserHandler {
  const normalizedOptions = normalizeOptions(options, 'application/json')

  const parse = createJsonParser(options)

  const readOptions = {
    ...normalizedOptions,
    // assert charset per RFC 7159 sec 8.1
    isValidCharset: (charset: string) => charset.slice(0, 4) === 'utf-'
  }

  return function jsonParser(req, res, next) {
    read(req, res, next, parse, debug, readOptions)
  }
}

/**
 * Create a JSON parse function
 *
 * @param {object} [options]
 * @return {function}
 * @private
 */
function createJsonParser(options?: JsonOptions | null): (body: string) => unknown {
  const reviver = options?.reviver
  const strict = options?.strict !== false

  if (strict) {
    return function parse(body) {
      if (body.length === 0) {
        // special-case empty json body, as it's a common client-side mistake
        // TODO: maybe make this configurable or part of "strict" option
        return {}
      }

      if (body[0] !== '{' && body[0] !== '[') {
        const first = firstNonWhitespaceChar(body)
        if (first !== '{' && first !== '[') {
          debug('strict violation')
          throw createStrictSyntaxError(body, first)
        }
      }

      try {
        debug('parse json')
        return JSON.parse(body, reviver)
      } catch (e) {
        throw normalizeJsonSyntaxError(e as SyntaxError, {
          message: (e as SyntaxError).message,
          stack: (e as SyntaxError).stack
        })
      }
    }
  }

  return function parseNonStrict(body) {
    if (body.length === 0) {
      // special-case empty json body, as it's a common client-side mistake
      // TODO: maybe make this configurable or part of "strict" option
      return {}
    }

    try {
      debug('parse json')
      return JSON.parse(body, reviver)
    } catch (e) {
      throw normalizeJsonSyntaxError(e as SyntaxError, {
        message: (e as SyntaxError).message,
        stack: (e as SyntaxError).stack
      })
    }
  }
}

/**
 * Create strict violation syntax error matching native error.
 *
 * @param {string} str
 * @param {string} char
 * @returns {Error}
 * @private
 */
function createStrictSyntaxError(str: string, char: string | undefined): SyntaxError {
  const index = str.indexOf(char as string)
  let partial = ''

  if (index !== -1) {
    partial = str.substring(0, index) + JSON_SYNTAX_CHAR.repeat(str.length - index)
  }

  try {
    JSON.parse(partial)
    /* istanbul ignore next */ throw new SyntaxError('strict violation')
  } catch (e) {
    return normalizeJsonSyntaxError(e as SyntaxError, {
      message: (e as SyntaxError).message.replace(JSON_SYNTAX_REGEXP, function (placeholder) {
        return str.substring(index, index + placeholder.length)
      }),
      stack: (e as SyntaxError).stack
    })
  }
}

/**
 * Get the first non-whitespace character in a string.
 *
 * @param {string} str
 * @returns {string|undefined}
 * @private
 */
function firstNonWhitespaceChar(str: string): string | undefined {
  const match = FIRST_NON_WHITESPACE_REGEXP.exec(str)

  return match && match[1] ? match[1] : undefined
}

/**
 * Normalize a SyntaxError for JSON.parse.
 *
 * @param {SyntaxError} error
 * @param {Object} obj
 * @returns {SyntaxError}
 * @private
 */
function normalizeJsonSyntaxError(
  error: SyntaxError,
  obj: { message: string; stack: string | undefined }
): SyntaxError {
  const keys = Object.getOwnPropertyNames(error)

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i] as string
    if (key !== 'stack' && key !== 'message') {
      delete (error as SyntaxError & { [key: string]: unknown })[key]
    }
  }

  // replace stack before message for Node.js 0.10 and below
  error.stack = (obj.stack as string).replace(error.message, obj.message)
  error.message = obj.message

  return error
}

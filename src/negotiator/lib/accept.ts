/*!
 * negotiator
 * Copyright(c) 2026 Blake Embrey
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 *
 * Loaded with `require` and typed with `typeof import(...)`, so the compiled
 * output calls them directly, with no interop helpers in between.
 * @private
 */

var contentType = require('content-type') as typeof import('content-type')

import type { ContentType } from 'content-type'

/** `parseAccept` itself, as the parsers that require this file call it. */
export type ParseAcceptHeader = (header: string) => ContentType[]

/**
 * Module exports.
 * @private
 */

module.exports = parseAccept

/**
 * Parse an Accept-style header.
 * @private
 */

function parseAccept(header: string): ContentType[] {
  var values: ContentType[] = []
  var index = 0

  while (index < header.length) {
    var start = skipOptionalWhitespace(header, index)
    var parsed = contentType.parse(header, { comma: true, start: start })

    // `content-type` normalizes the type, but accept methods return original casing.
    parsed.type = header.slice(start, start + parsed.type.length)
    values.push(parsed)

    index = parsed.index + 1
  }

  return values
}

/**
 * Skip optional whitespace.
 * @private
 */

function skipOptionalWhitespace(header: string, index: number): number {
  var cursor = index

  while (header.charCodeAt(cursor) === 0x20 || header.charCodeAt(cursor) === 0x09) {
    cursor++
  }

  return cursor
}

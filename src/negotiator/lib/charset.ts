/**
 * negotiator
 * Copyright(c) 2012 Isaac Z. Schlueter
 * Copyright(c) 2014 Federico Romero
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
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

var parseAccept = require('./accept') as ParseAcceptHeader

import type { ContentType } from 'content-type'
import type { ParseAcceptHeader } from './accept'

/** A charset from an Accept-Charset header, as negotiation compares it. */
interface CharsetSpec {
  charset: string
  q: number
  /** its position in the header */
  i: number
}

/** How well a provided charset matches the header: its position, the charset's position, quality and specificity. */
interface CharsetPriority {
  i?: number
  o: number
  q: number
  s: number
}

/** `preferredCharsets` itself. */
export type PreferredCharsets = (accept: string | undefined, provided?: string[]) => string[]

/**
 * Module exports.
 * @public
 */

module.exports = preferredCharsets
module.exports.preferredCharsets = preferredCharsets

/**
 * Module variables.
 * @private
 */

function parseAcceptCharset(accept: string): readonly CharsetSpec[] {
  var cached = parsedAcceptCharsets.get(accept)
  if (cached !== undefined) {
    return cached
  }

  var accepts: Array<ContentType | CharsetSpec> = parseAccept(accept)

  for (var i = 0, j = 0; i < accepts.length; i++) {
    var charset = formatCharset(accepts[i] as ContentType, i)
    if (charset) accepts[j++] = charset
  }

  accepts.length = j
  return typeof accept === 'string' ? remember(accept, accepts as CharsetSpec[]) : (accepts as CharsetSpec[])
}

/**
 * Parsed Accept-Charset headers, remembered by header string (not in
 * upstream), the same way as the Accept headers in `mediaType`: at most
 * CACHE_LIMIT entries, replaced with a new map when full (not cleared; see
 * there why), each list frozen but not its specs. A header that isn't a string
 * is parsed every time, as before.
 * @private
 */

const CACHE_LIMIT = 100
var parsedAcceptCharsets = new Map<string, readonly CharsetSpec[]>()

function remember(key: string, value: CharsetSpec[]): readonly CharsetSpec[] {
  if (parsedAcceptCharsets.size >= CACHE_LIMIT) {
    parsedAcceptCharsets = new Map()
  }
  parsedAcceptCharsets.set(key, Object.freeze(value))
  return value
}

/**
 * Format a parsed charset for negotiation.
 * @private
 */

function formatCharset(parsed: ContentType, i: number): CharsetSpec | null {
  if (!parsed.type) return null

  return {
    charset: parsed.type,
    q: parsed.parameters.q ? parseFloat(parsed.parameters.q) : 1,
    i: i
  }
}

/**
 * Get the priority of a charset.
 * @private
 */

function getCharsetPriority(charset: string, accepted: readonly CharsetSpec[], index: number): CharsetPriority {
  var priority: CharsetPriority = { o: -1, q: 0, s: 0 }

  for (var i = 0; i < accepted.length; i++) {
    var spec = specify(charset, accepted[i] as CharsetSpec, index)

    if (spec && (priority.s - spec.s || priority.q - spec.q || priority.o - spec.o) < 0) {
      priority = spec
    }
  }

  return priority
}

/**
 * Get the specificity of the charset.
 * @private
 */

function specify(charset: string, spec: CharsetSpec, index: number): CharsetPriority | null {
  var s = 0
  if (spec.charset.toLowerCase() === charset.toLowerCase()) {
    s |= 1
  } else if (spec.charset !== '*') {
    return null
  }

  return {
    i: index,
    o: spec.i,
    q: spec.q,
    s: s
  }
}

/**
 * Get the preferred charsets from an Accept-Charset header.
 * @public
 */

function preferredCharsets(accept: string | undefined, provided?: string[]): string[] {
  // RFC 2616 sec 14.2: no header = *
  var accepts = parseAcceptCharset(accept === undefined ? '*' : accept || '')

  if (!provided) {
    // sorted list of all charsets
    return accepts
      .filter(isQuality)
      .sort(compareSpecs as unknown as (a: CharsetSpec, b: CharsetSpec) => number)
      .map(getFullCharset)
  }

  var priorities = provided.map(function getPriority(type, index) {
    return getCharsetPriority(type, accepts, index)
  })

  // sorted list of accepted charsets
  return priorities
    .filter(isQuality)
    .sort(compareSpecs)
    .map(function getCharset(priority) {
      return provided[priorities.indexOf(priority)] as string
    })
}

/**
 * Compare two specs.
 * @private
 */

function compareSpecs(a: CharsetPriority, b: CharsetPriority): number {
  return b.q - a.q || b.s - a.s || a.o - b.o || (a.i as number) - (b.i as number) || 0
}

/**
 * Get full charset string.
 * @private
 */

function getFullCharset(spec: CharsetSpec): string {
  return spec.charset
}

/**
 * Check if a spec has any quality.
 * @private
 */

function isQuality(spec: { q: number }): boolean {
  return spec.q > 0
}

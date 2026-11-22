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

/** A coding from an Accept-Encoding header, as negotiation compares it. */
interface EncodingSpec {
  encoding: string
  q: number
  /** its position in the header */
  i: number
}

/** How well a provided encoding matches the header: its position, the coding's position, quality and specificity. */
interface EncodingPriority {
  encoding: string
  i?: number | undefined
  o: number
  q: number
  s: number
}

/** `preferredEncodings` itself. */
export type PreferredEncodings = (accept: string | undefined, provided?: string[], preferred?: string[]) => string[]

/**
 * Module exports.
 * @public
 */

module.exports = preferredEncodings
module.exports.preferredEncodings = preferredEncodings

/**
 * Module variables.
 * @private
 */

function parseAcceptEncoding(accept: string): readonly EncodingSpec[] {
  var cached = parsedAcceptEncodings.get(accept)
  if (cached !== undefined) {
    return cached
  }

  var accepts: Array<ContentType | EncodingSpec> = parseAccept(accept)
  var hasIdentity: EncodingPriority | boolean | null = false
  var minQuality = 1

  for (var i = 0, j = 0; i < accepts.length; i++) {
    var encoding = formatEncoding(accepts[i] as ContentType, i)

    if (encoding) {
      accepts[j++] = encoding
      hasIdentity = hasIdentity || specify('identity', encoding)
      minQuality = Math.min(minQuality, encoding.q || 1)
    }
  }

  if (!hasIdentity) {
    /*
     * If identity doesn't explicitly appear in the accept-encoding header,
     * it's added to the list of acceptable encoding with the lowest q
     */
    accepts[j++] = {
      encoding: 'identity',
      q: minQuality,
      i: i
    }
  }

  accepts.length = j
  return typeof accept === 'string' ? remember(accept, accepts as EncodingSpec[]) : (accepts as EncodingSpec[])
}

/**
 * Parsed Accept-Encoding headers, remembered by header string (not in
 * upstream), the same way as the Accept headers in `mediaType`: at most
 * CACHE_LIMIT entries, replaced with a new map when full (not cleared; see
 * there why), each list frozen but not its specs. A header that isn't a string
 * is parsed every time, as before.
 * @private
 */

const CACHE_LIMIT = 100
var parsedAcceptEncodings = new Map<string, readonly EncodingSpec[]>()

function remember(key: string, value: EncodingSpec[]): readonly EncodingSpec[] {
  if (parsedAcceptEncodings.size >= CACHE_LIMIT) {
    parsedAcceptEncodings = new Map()
  }
  parsedAcceptEncodings.set(key, Object.freeze(value))
  return value
}

/**
 * Format a parsed encoding for negotiation.
 * @private
 */

function formatEncoding(parsed: ContentType, i: number): EncodingSpec | null {
  if (!parsed.type) return null

  return {
    encoding: parsed.type,
    q: parsed.parameters.q ? parseFloat(parsed.parameters.q) : 1,
    i: i
  }
}

/**
 * Get the priority of an encoding.
 * @private
 */

function getEncodingPriority(encoding: string, accepted: readonly EncodingSpec[], index: number): EncodingPriority {
  var priority: EncodingPriority = { encoding: encoding, o: -1, q: 0, s: 0 }

  for (var i = 0; i < accepted.length; i++) {
    var spec = specify(encoding, accepted[i] as EncodingSpec, index)

    if (spec && (priority.s - spec.s || priority.q - spec.q || priority.o - spec.o) < 0) {
      priority = spec
    }
  }

  return priority
}

/**
 * Get the specificity of the encoding.
 * @private
 */

function specify(encoding: string, spec: EncodingSpec, index?: number): EncodingPriority | null {
  var s = 0
  if (spec.encoding.toLowerCase() === encoding.toLowerCase()) {
    s |= 1
  } else if (spec.encoding !== '*') {
    return null
  }

  return {
    encoding: encoding,
    i: index,
    o: spec.i,
    q: spec.q,
    s: s
  }
}

/**
 * Get the preferred encodings from an Accept-Encoding header.
 * @public
 */

function preferredEncodings(accept: string | undefined, provided?: string[], preferred?: string[]): string[] {
  var accepts = parseAcceptEncoding(accept || '')

  var comparator = preferred
    ? function comparator(a: EncodingPriority, b: EncodingPriority): number {
        if (a.q !== b.q) {
          return b.q - a.q // higher quality first
        }

        var aPreferred = preferred.indexOf(a.encoding)
        var bPreferred = preferred.indexOf(b.encoding)

        if (aPreferred === -1 && bPreferred === -1) {
          // consider the original specifity/order
          return b.s - a.s || a.o - b.o || (a.i as number) - (b.i as number)
        }

        if (aPreferred !== -1 && bPreferred !== -1) {
          return aPreferred - bPreferred // consider the preferred order
        }

        return aPreferred === -1 ? 1 : -1 // preferred first
      }
    : compareSpecs

  if (!provided) {
    // sorted list of all encodings
    return accepts
      .filter(isQuality)
      .sort(comparator as unknown as (a: EncodingSpec, b: EncodingSpec) => number)
      .map(getFullEncoding)
  }

  var priorities = provided.map(function getPriority(type, index) {
    return getEncodingPriority(type, accepts, index)
  })

  // sorted list of accepted encodings
  return priorities
    .filter(isQuality)
    .sort(comparator)
    .map(function getEncoding(priority) {
      return provided[priorities.indexOf(priority)] as string
    })
}

/**
 * Compare two specs.
 * @private
 */

function compareSpecs(a: EncodingPriority, b: EncodingPriority): number {
  return b.q - a.q || b.s - a.s || a.o - b.o || (a.i as number) - (b.i as number)
}

/**
 * Get full encoding string.
 * @private
 */

function getFullEncoding(spec: EncodingSpec): string {
  return spec.encoding
}

/**
 * Check if a spec has any quality.
 * @private
 */

function isQuality(spec: { q: number }): boolean {
  return spec.q > 0
}

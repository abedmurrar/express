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

var contentType = require('content-type') as typeof import('content-type')
var parseAcceptHeader = require('./accept') as ParseAcceptHeader

import type { ContentType } from 'content-type'
import type { ParseAcceptHeader } from './accept'

/** A media range from an Accept header, as negotiation compares it. */
interface MediaTypeSpec {
  type: string
  subtype: string
  params: Record<string, string>
  q: number
  /** its position in the header */
  i: number
}

/** How well a provided type matches the header: its position, the range's position, quality and specificity. */
interface MediaTypePriority {
  i?: number
  o: number
  q: number
  s: number
}

/** `preferredMediaTypes` itself. */
export type PreferredMediaTypes = (accept: string | undefined, provided?: string[]) => string[]

/**
 * Module exports.
 * @public
 */

module.exports = preferredMediaTypes
module.exports.preferredMediaTypes = preferredMediaTypes

/**
 * Module variables.
 * @private
 */

function parseAccept(accept: string): readonly MediaTypeSpec[] {
  var cached = parsedAccepts.get(accept)
  if (cached !== undefined) {
    return cached
  }

  var accepts: Array<ContentType | MediaTypeSpec> = parseAcceptHeader(accept)

  for (var i = 0, j = 0; i < accepts.length; i++) {
    var mediaType = formatMediaType(accepts[i] as ContentType, i)
    if (mediaType) accepts[j++] = mediaType
  }

  accepts.length = j
  return typeof accept === 'string' ? remember(accept, accepts as MediaTypeSpec[]) : (accepts as MediaTypeSpec[])
}

/**
 * Parsed Accept headers, remembered by header string (not in upstream): a
 * client sends the same header with every request, so parsing it again can
 * be skipped. The map holds at most CACHE_LIMIT entries, so headers taken
 * from requests can't grow it without bound. When full it is replaced with
 * a new, empty map instead of being emptied with `clear()`: a long-lived map
 * is in V8's old generation, `clear()` gives it a new table there too, and
 * the tables it leaves behind keep every list put in them alive through the
 * minor collections, until the next full one. With a different header on
 * every request, that made each parse about 3 µs slower; a new map starts in
 * the young generation with what it holds. Each list is frozen, so code
 * that sorts or edits it in place fails loudly instead of changing what the
 * next caller gets. The specs in it are not: nothing writes to them after
 * parsing, they never leave this file (callers get new arrays of strings),
 * and freezing them cost about 1 µs per new header. A header that isn't a
 * string is parsed every time, as before.
 * @private
 */

const CACHE_LIMIT = 100
var parsedAccepts = new Map<string, readonly MediaTypeSpec[]>()

function remember(key: string, value: MediaTypeSpec[]): readonly MediaTypeSpec[] {
  if (parsedAccepts.size >= CACHE_LIMIT) {
    parsedAccepts = new Map()
  }
  parsedAccepts.set(key, Object.freeze(value))
  return value
}

/**
 * Format a parsed content type for negotiation.
 * @private
 */

function formatMediaType(parsed: ContentType, i: number): MediaTypeSpec | null {
  var slash = parsed.type.indexOf('/')
  if (slash === -1) return null

  var q = parsed.parameters.q ? parseFloat(parsed.parameters.q) : 1

  delete parsed.parameters.q

  return {
    type: parsed.type.slice(0, slash),
    subtype: parsed.type.slice(slash + 1),
    params: parsed.parameters,
    q: q,
    i: i
  }
}

/**
 * Get the priority of a media type.
 * @private
 */

function getMediaTypePriority(type: string, accepted: readonly MediaTypeSpec[], index: number): MediaTypePriority {
  var priority: MediaTypePriority = { o: -1, q: 0, s: 0 }

  for (var i = 0; i < accepted.length; i++) {
    var spec = specify(type, accepted[i] as MediaTypeSpec, index)

    if (spec && (priority.s - spec.s || priority.q - spec.q || priority.o - spec.o) < 0) {
      priority = spec
    }
  }

  return priority
}

/**
 * Get the specificity of the media type.
 * @private
 */

function specify(type: string, spec: MediaTypeSpec, index: number): MediaTypePriority | null {
  var p = formatMediaType(contentType.parse(type), 0)
  var s = 0

  if (!p) {
    return null
  }

  if (spec.type.toLowerCase() === p.type.toLowerCase()) {
    s |= 4
  } else if (spec.type !== '*') {
    return null
  }

  if (spec.subtype.toLowerCase() === p.subtype.toLowerCase()) {
    s |= 2
  } else if (spec.subtype !== '*') {
    return null
  }

  var keys = Object.keys(spec.params)
  if (keys.length > 0) {
    if (
      keys.every(function (k) {
        return (
          spec.params[k] === '*' ||
          (spec.params[k] || '').toLowerCase() === ((p as MediaTypeSpec).params[k] || '').toLowerCase()
        )
      })
    ) {
      s |= 1
    } else {
      return null
    }
  }

  return {
    i: index,
    o: spec.i,
    q: spec.q,
    s: s
  }
}

/**
 * Get the preferred media types from an Accept header.
 * @public
 */

function preferredMediaTypes(accept: string | undefined, provided?: string[]): string[] {
  // RFC 2616 sec 14.2: no header = */*
  var accepts = parseAccept(accept === undefined ? '*/*' : accept || '')

  if (!provided) {
    // sorted list of all types
    return accepts
      .filter(isQuality)
      .sort(compareSpecs as unknown as (a: MediaTypeSpec, b: MediaTypeSpec) => number)
      .map(getFullType)
  }

  var priorities = provided.map(function getPriority(type, index) {
    return getMediaTypePriority(type, accepts, index)
  })

  // sorted list of accepted types
  return priorities
    .filter(isQuality)
    .sort(compareSpecs)
    .map(function getType(priority) {
      return provided[priorities.indexOf(priority)] as string
    })
}

/**
 * Compare two specs.
 * @private
 */

function compareSpecs(a: MediaTypePriority, b: MediaTypePriority): number {
  return b.q - a.q || b.s - a.s || a.o - b.o || (a.i as number) - (b.i as number) || 0
}

/**
 * Get full type string.
 * @private
 */

function getFullType(spec: MediaTypeSpec): string {
  return spec.type + '/' + spec.subtype
}

/**
 * Check if a spec has any quality.
 * @private
 */

function isQuality(spec: { q: number }): boolean {
  return spec.q > 0
}

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
var parseAccept = require('./accept') as ParseAcceptHeader

import type { ContentType } from 'content-type'
import type { ParseAcceptHeader } from './accept'

/** A language range from an Accept-Language header, as negotiation compares it. */
interface LanguageSpec {
  prefix: string
  suffix: string | undefined
  q: number
  /** its position in the header */
  i: number
  full: string
}

/** How well a provided language matches the header: its position, the range's position, quality and specificity. */
interface LanguagePriority {
  i?: number
  o: number
  q: number
  s: number
}

/** `preferredLanguages` itself. */
export type PreferredLanguages = (accept: string | undefined, provided?: string[]) => string[]

/**
 * Module exports.
 * @public
 */

module.exports = preferredLanguages
module.exports.preferredLanguages = preferredLanguages

/**
 * Module variables.
 * @private
 */

function parseAcceptLanguage(accept: string): readonly LanguageSpec[] {
  var cached = parsedAcceptLanguages.get(accept)
  if (cached !== undefined) {
    return cached
  }

  var accepts: Array<ContentType | LanguageSpec> = parseAccept(accept)

  for (var i = 0, j = 0; i < accepts.length; i++) {
    var language = formatLanguage(accepts[i] as ContentType, i)
    if (language) accepts[j++] = language
  }

  accepts.length = j
  return typeof accept === 'string' ? remember(accept, accepts as LanguageSpec[]) : (accepts as LanguageSpec[])
}

/**
 * Parsed Accept-Language headers, remembered by header string (not in
 * upstream), the same way as the Accept headers in `mediaType`: at most
 * CACHE_LIMIT entries, replaced with a new map when full (not cleared; see
 * there why), each list frozen but not its specs. A header that isn't a string
 * is parsed every time, as before.
 * @private
 */

const CACHE_LIMIT = 100
var parsedAcceptLanguages = new Map<string, readonly LanguageSpec[]>()

function remember(key: string, value: LanguageSpec[]): readonly LanguageSpec[] {
  if (parsedAcceptLanguages.size >= CACHE_LIMIT) {
    parsedAcceptLanguages = new Map()
  }
  parsedAcceptLanguages.set(key, Object.freeze(value))
  return value
}

/**
 * Format a parsed language for negotiation.
 * @private
 */

function formatLanguage(parsed: ContentType, i: number): LanguageSpec | null {
  if (!parsed.type) return null

  var hyphen = parsed.type.indexOf('-')
  var prefix = hyphen === -1 ? parsed.type : parsed.type.slice(0, hyphen)
  var suffix = hyphen === -1 ? undefined : parsed.type.slice(hyphen + 1)

  return {
    prefix: prefix,
    suffix: suffix,
    q: parsed.parameters.q ? parseFloat(parsed.parameters.q) : 1,
    i: i,
    full: parsed.type
  }
}

/**
 * Get the priority of a language.
 * @private
 */

function getLanguagePriority(language: string, accepted: readonly LanguageSpec[], index: number): LanguagePriority {
  var priority: LanguagePriority = { o: -1, q: 0, s: 0 }

  for (var i = 0; i < accepted.length; i++) {
    var spec = specify(language, accepted[i] as LanguageSpec, index)

    if (spec && (priority.s - spec.s || priority.q - spec.q || priority.o - spec.o) < 0) {
      priority = spec
    }
  }

  return priority
}

/**
 * Get the specificity of the language.
 * @private
 */

function specify(language: string, spec: LanguageSpec, index: number): LanguagePriority | null {
  var p = formatLanguage(contentType.parse(language), 0)
  if (!p) return null
  var s = 0
  if (spec.full.toLowerCase() === p.full.toLowerCase()) {
    s |= 4
  } else if (spec.prefix.toLowerCase() === p.full.toLowerCase()) {
    s |= 2
  } else if (spec.full.toLowerCase() === p.prefix.toLowerCase()) {
    s |= 1
  } else if (spec.full !== '*') {
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
 * Get the preferred languages from an Accept-Language header.
 * @public
 */

function preferredLanguages(accept: string | undefined, provided?: string[]): string[] {
  // RFC 2616 sec 14.4: no header = *
  var accepts = parseAcceptLanguage(accept === undefined ? '*' : accept || '')

  if (!provided) {
    // sorted list of all languages
    return accepts
      .filter(isQuality)
      .sort(compareSpecs as unknown as (a: LanguageSpec, b: LanguageSpec) => number)
      .map(getFullLanguage)
  }

  var priorities = provided.map(function getPriority(type, index) {
    return getLanguagePriority(type, accepts, index)
  })

  // sorted list of accepted languages
  return priorities
    .filter(isQuality)
    .sort(compareSpecs)
    .map(function getLanguage(priority) {
      return provided[priorities.indexOf(priority)] as string
    })
}

/**
 * Compare two specs.
 * @private
 */

function compareSpecs(a: LanguagePriority, b: LanguagePriority): number {
  return b.q - a.q || b.s - a.s || a.o - b.o || (a.i as number) - (b.i as number) || 0
}

/**
 * Get full language string.
 * @private
 */

function getFullLanguage(spec: LanguageSpec): string {
  return spec.full
}

/**
 * Check if a spec has any quality.
 * @private
 */

function isQuality(spec: { q: number }): boolean {
  return spec.q > 0
}

/*!
 * negotiator
 * Copyright(c) 2012 Federico Romero
 * Copyright(c) 2012-2014 Isaac Z. Schlueter
 * Copyright(c) 2015 Douglas Christopher Wilson
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

var preferredCharsets = require('./lib/charset') as PreferredCharsets
var preferredEncodings = require('./lib/encoding') as PreferredEncodings
var preferredLanguages = require('./lib/language') as PreferredLanguages
var preferredMediaTypes = require('./lib/mediaType') as PreferredMediaTypes

import type { IncomingHttpHeaders } from 'node:http'
import type { PreferredCharsets } from './lib/charset'
import type { PreferredEncodings } from './lib/encoding'
import type { PreferredLanguages } from './lib/language'
import type { PreferredMediaTypes } from './lib/mediaType'

/** What a negotiator reads from a request: its headers. */
export interface NegotiatorRequest {
  headers: IncomingHttpHeaders
}

/** `encoding()` and `encodings()` options. */
export interface NegotiatorEncodingOptions {
  /** encodings to prefer, in order, among those of the same quality */
  preferred?: string[] | undefined
}

/**
 * A negotiator for one request. Each method returns the provided values the
 * client accepts, best first (or the header's own values, when none are
 * provided); the singular methods return only the best one.
 */
export interface Negotiator {
  request: NegotiatorRequest
  charset(available?: string[]): string | undefined
  charsets(available?: string[]): string[]
  encoding(available?: string[], opts?: NegotiatorEncodingOptions): string | undefined
  encodings(available?: string[], options?: NegotiatorEncodingOptions): string[]
  language(available?: string[]): string | undefined
  languages(available?: string[]): string[]
  mediaType(available?: string[]): string | undefined
  mediaTypes(available?: string[]): string[]
  preferredCharset(available?: string[]): string | undefined
  preferredCharsets(available?: string[]): string[]
  preferredEncoding(available?: string[], opts?: NegotiatorEncodingOptions): string | undefined
  preferredEncodings(available?: string[], options?: NegotiatorEncodingOptions): string[]
  preferredLanguage(available?: string[]): string | undefined
  preferredLanguages(available?: string[]): string[]
  preferredMediaType(available?: string[]): string | undefined
  preferredMediaTypes(available?: string[]): string[]
}

/** `Negotiator` itself, which works with or without `new`. */
export interface NegotiatorConstructor {
  new (request: NegotiatorRequest): Negotiator
  (request: NegotiatorRequest): Negotiator
  prototype: Negotiator
  Negotiator: NegotiatorConstructor
}

/**
 * Module exports.
 * @public
 */

module.exports = Negotiator
module.exports.Negotiator = Negotiator

/**
 * Create a Negotiator instance from a request.
 * @param {object} request
 * @public
 */

function Negotiator(this: Negotiator, request: NegotiatorRequest): Negotiator | void {
  if (!(this instanceof Negotiator)) {
    return new (Negotiator as unknown as NegotiatorConstructor)(request)
  }

  this.request = request
}

const proto = Negotiator.prototype as Negotiator

proto.charset = function charset(available) {
  var set = this.charsets(available)
  return set && set[0]
}

proto.charsets = function charsets(available) {
  return preferredCharsets(this.request.headers['accept-charset'] as string | undefined, available)
}

proto.encoding = function encoding(available, opts) {
  var set = this.encodings(available, opts)
  return set && set[0]
}

proto.encodings = function encodings(available, options) {
  var opts = options || {}
  return preferredEncodings(this.request.headers['accept-encoding'], available, opts.preferred)
}

proto.language = function language(available) {
  var set = this.languages(available)
  return set && set[0]
}

proto.languages = function languages(available) {
  return preferredLanguages(this.request.headers['accept-language'], available)
}

proto.mediaType = function mediaType(available) {
  var set = this.mediaTypes(available)
  return set && set[0]
}

proto.mediaTypes = function mediaTypes(available) {
  return preferredMediaTypes(this.request.headers.accept, available)
}

// Backwards compatibility
proto.preferredCharset = proto.charset
proto.preferredCharsets = proto.charsets
proto.preferredEncoding = proto.encoding
proto.preferredEncodings = proto.encodings
proto.preferredLanguage = proto.language
proto.preferredLanguages = proto.languages
proto.preferredMediaType = proto.mediaType
proto.preferredMediaTypes = proto.mediaTypes

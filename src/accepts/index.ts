/*!
 * accepts
 * Copyright(c) 2014 Jonathan Ong
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

var Negotiator = require('../negotiator') as NegotiatorConstructor
var mime = require('mime-types') as typeof import('mime-types')

import type { IncomingHttpHeaders } from 'node:http'
import type { Negotiator as NegotiatorInstance, NegotiatorConstructor, NegotiatorRequest } from '../negotiator'

/**
 * An `accepts` object for one request. The method overloads are those of
 * `@types/accepts` 1.3 (DefinitelyTyped, MIT): with no arguments a method
 * returns everything the client accepts, best first; with a list it returns
 * the best accepted entry, or `false` when none is accepted.
 */
export interface Accepts {
  headers: IncomingHttpHeaders
  negotiator: NegotiatorInstance
  charset(): string[]
  charset(charsets: string[]): string | false
  charset(...charsets: string[]): string | false
  charsets(): string[]
  charsets(charsets: string[]): string | false
  charsets(...charsets: string[]): string | false
  encoding(): string[]
  encoding(encodings: string[]): string | false
  encoding(...encodings: string[]): string | false
  encodings(): string[]
  encodings(encodings: string[]): string | false
  encodings(...encodings: string[]): string | false
  language(): string[]
  language(languages: string[]): string | false
  language(...languages: string[]): string | false
  languages(): string[]
  languages(languages: string[]): string | false
  languages(...languages: string[]): string | false
  lang(): string[]
  lang(languages: string[]): string | false
  lang(...languages: string[]): string | false
  langs(): string[]
  langs(languages: string[]): string | false
  langs(...languages: string[]): string | false
  type(types: string[]): string[] | string | false
  type(...types: string[]): string[] | string | false
  types(types: string[]): string[] | string | false
  types(...types: string[]): string[] | string | false
}

/** `accepts` itself, which works with or without `new`. */
export interface AcceptsConstructor {
  new (req: NegotiatorRequest): Accepts
  (req: NegotiatorRequest): Accepts
  prototype: Accepts
}

/**
 * Module exports.
 * @public
 */

module.exports = Accepts

/**
 * Create a new Accepts object for the given req.
 *
 * @param {object} req
 * @public
 */

function Accepts(this: Accepts, req: NegotiatorRequest): Accepts | void {
  if (!(this instanceof Accepts)) {
    return new (Accepts as unknown as AcceptsConstructor)(req)
  }

  this.headers = req.headers
  this.negotiator = new Negotiator(req)
}

const proto = Accepts.prototype as Accepts

/**
 * Check if the given `type(s)` is acceptable, returning
 * the best match when true, otherwise `undefined`, in which
 * case you should respond with 406 "Not Acceptable".
 *
 * The `type` value may be a single mime type string
 * such as "application/json", the extension name
 * such as "json" or an array `["json", "html", "text/plain"]`. When a list
 * or array is given the _best_ match, if any is returned.
 *
 * Examples:
 *
 *     // Accept: text/html
 *     this.types('html');
 *     // => "html"
 *
 *     // Accept: text/*, application/json
 *     this.types('html');
 *     // => "html"
 *     this.types('text/html');
 *     // => "text/html"
 *     this.types('json', 'text');
 *     // => "json"
 *     this.types('application/json');
 *     // => "application/json"
 *
 *     // Accept: text/*, application/json
 *     this.types('image/png');
 *     this.types('png');
 *     // => undefined
 *
 *     // Accept: text/*;q=.5, application/json
 *     this.types(['html', 'json']);
 *     this.types('html', 'json');
 *     // => "json"
 *
 * @param {String|Array} types...
 * @return {String|Array|Boolean}
 * @public
 */

proto.type = proto.types = function (this: Accepts, types_?: string | string[]) {
  var types = types_

  // support flattened arguments
  if (types && !Array.isArray(types)) {
    types = new Array<string>(arguments.length)
    for (var i = 0; i < types.length; i++) {
      types[i] = arguments[i] as string
    }
  }

  // no types, return all requested types
  if (!types || types.length === 0) {
    return this.negotiator.mediaTypes()
  }

  // no accept header, return first given type
  if (!this.headers.accept) {
    return types[0]
  }

  var mimes = (types as string[]).map(extToMime)
  var accepts = this.negotiator.mediaTypes(mimes.filter(validMime))
  var first = accepts[0]

  return first ? types[mimes.indexOf(first)] : false
} as Accepts['types']

/**
 * Return accepted encodings or best fit based on `encodings`.
 *
 * Given `Accept-Encoding: gzip, deflate`
 * an array sorted by quality is returned:
 *
 *     ['gzip', 'deflate']
 *
 * @param {String|Array} encodings...
 * @return {String|Array}
 * @public
 */

proto.encoding = proto.encodings = function (this: Accepts, encodings_?: string | string[]) {
  var encodings = encodings_

  // support flattened arguments
  if (encodings && !Array.isArray(encodings)) {
    encodings = new Array<string>(arguments.length)
    for (var i = 0; i < encodings.length; i++) {
      encodings[i] = arguments[i] as string
    }
  }

  // no encodings, return all requested encodings
  if (!encodings || encodings.length === 0) {
    return this.negotiator.encodings()
  }

  return this.negotiator.encodings(encodings as string[])[0] || false
} as Accepts['encodings']

/**
 * Return accepted charsets or best fit based on `charsets`.
 *
 * Given `Accept-Charset: utf-8, iso-8859-1;q=0.2, utf-7;q=0.5`
 * an array sorted by quality is returned:
 *
 *     ['utf-8', 'utf-7', 'iso-8859-1']
 *
 * @param {String|Array} charsets...
 * @return {String|Array}
 * @public
 */

proto.charset = proto.charsets = function (this: Accepts, charsets_?: string | string[]) {
  var charsets = charsets_

  // support flattened arguments
  if (charsets && !Array.isArray(charsets)) {
    charsets = new Array<string>(arguments.length)
    for (var i = 0; i < charsets.length; i++) {
      charsets[i] = arguments[i] as string
    }
  }

  // no charsets, return all requested charsets
  if (!charsets || charsets.length === 0) {
    return this.negotiator.charsets()
  }

  return this.negotiator.charsets(charsets as string[])[0] || false
} as Accepts['charsets']

/**
 * Return accepted languages or best fit based on `langs`.
 *
 * Given `Accept-Language: en;q=0.8, es, pt`
 * an array sorted by quality is returned:
 *
 *     ['es', 'pt', 'en']
 *
 * @param {String|Array} langs...
 * @return {Array|String}
 * @public
 */

proto.lang =
  proto.langs =
  proto.language =
  proto.languages =
    function (this: Accepts, languages_?: string | string[]) {
      var languages = languages_

      // support flattened arguments
      if (languages && !Array.isArray(languages)) {
        languages = new Array<string>(arguments.length)
        for (var i = 0; i < languages.length; i++) {
          languages[i] = arguments[i] as string
        }
      }

      // no languages, return all requested languages
      if (!languages || languages.length === 0) {
        return this.negotiator.languages()
      }

      return this.negotiator.languages(languages as string[])[0] || false
    } as Accepts['languages']

/**
 * Convert extnames to mime.
 *
 * @param {String} type
 * @return {String}
 * @private
 */

function extToMime(type: string): string | false {
  return type.indexOf('/') === -1 ? mime.lookup(type) : type
}

/**
 * Check if mime is valid.
 *
 * @param {String} type
 * @return {Boolean}
 * @private
 */

function validMime(type: string | false): type is string {
  return typeof type === 'string'
}

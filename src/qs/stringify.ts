'use strict'

/**
 * Module dependencies.
 *
 * `side-channel` is replaced by `Map` (see `Channel` below).
 * @private
 */

var utils = require('./utils') as Utils
var formats = require('./formats') as Formats
var has = Object.prototype.hasOwnProperty

import type { FormatName, Formats, Formatter } from './formats'
import type { QsRecord, Utils } from './utils'

/** A custom encoder, called for every key and value with the default encoder, the charset, which of the two it is and the format. */
export type Encoder = (
  str: unknown,
  defaultEncoder: Encoder,
  charset: string,
  type: 'key' | 'value',
  format: FormatName
) => unknown

/** How arrays are written: `a[]=b`, `a=b,c`, `a[0]=b` or `a=b&a=c`. */
export type ArrayFormat = 'brackets' | 'comma' | 'indices' | 'repeat'

/** A `filter` function: called with each key prefix and value, it returns the value to stringify (`undefined` leaves it out). */
type FilterFunction = (prefix: string, value: unknown) => unknown

type SortFunction = (a: string, b: string) => number

/** `stringify()` options. */
export interface StringifyOptions {
  addQueryPrefix?: boolean | undefined
  allowDots?: boolean | undefined
  allowEmptyArrays?: boolean | undefined
  arrayFormat?: ArrayFormat | undefined
  charset?: 'utf-8' | 'iso-8859-1' | undefined
  charsetSentinel?: boolean | undefined
  commaRoundTrip?: boolean | undefined
  delimiter?: string | undefined
  depth?: number | undefined
  encode?: boolean | undefined
  encodeDotInKeys?: boolean | undefined
  encoder?: Encoder | null | undefined
  encodeValuesOnly?: boolean | undefined
  filter?: FilterFunction | Array<string | number> | undefined
  format?: FormatName | undefined
  /** deprecated: `arrayFormat` */
  indices?: boolean | undefined
  serializeDate?: ((date: Date) => unknown) | undefined
  skipNulls?: boolean | undefined
  sort?: SortFunction | null | undefined
  strictNullHandling?: boolean | undefined
}

/** `stringify()` itself. */
export type StringifyFunction = (object: unknown, opts?: StringifyOptions) => string

/** The options once `normalizeStringifyOptions` has filled in the defaults (`defaults` itself also has `indices`). */
interface NormalizedStringifyOptions {
  addQueryPrefix: boolean
  allowDots: boolean
  allowEmptyArrays: boolean
  arrayFormat: ArrayFormat
  charset: 'utf-8' | 'iso-8859-1'
  charsetSentinel: boolean
  commaRoundTrip: boolean
  delimiter: string
  depth: number
  encode: boolean
  encodeDotInKeys: boolean
  encoder: Encoder
  encodeValuesOnly: boolean
  filter: FilterFunction | unknown[] | undefined
  format: FormatName
  formatter: Formatter
  indices?: boolean
  serializeDate: (date: Date) => unknown
  skipNulls: boolean
  sort?: SortFunction | null
  strictNullHandling: boolean
}

type GenerateArrayPrefix = ((prefix: string, key: string) => string) | 'comma'

/**
 * Where each object sits in the tree being stringified, for cycle detection:
 * each level's channel maps the objects seen at that level to their step,
 * and `sentinel` to the parent level's channel. A `Map`, not a `WeakMap`:
 * the key is the value before `filter` runs, so it can be a primitive (a
 * filter that turns a string into an object), which `side-channel` kept in a
 * `Map` too. The channels live only as long as one `stringify()` call.
 */
type Channel = Map<unknown, unknown>

var arrayPrefixGenerators = {
  brackets: function brackets(prefix: string): string {
    return prefix + '[]'
  },
  comma: 'comma' as const,
  indices: function indices(prefix: string, key: string): string {
    return prefix + '[' + key + ']'
  },
  repeat: function repeat(prefix: string): string {
    return prefix
  }
}

var isArray = Array.isArray as (value: unknown) => value is unknown[]
var push = Array.prototype.push
var pushToArray = function (arr: string[], valueOrArray: string | string[]): void {
  push.apply(arr, isArray(valueOrArray) ? valueOrArray : [valueOrArray])
}

var toISO = Date.prototype.toISOString

var defaultFormat = formats['default']
var defaults: NormalizedStringifyOptions = {
  addQueryPrefix: false,
  allowDots: false,
  allowEmptyArrays: false,
  arrayFormat: 'indices',
  charset: 'utf-8',
  charsetSentinel: false,
  commaRoundTrip: false,
  delimiter: '&',
  depth: Infinity,
  encode: true,
  encodeDotInKeys: false,
  encoder: utils.encode,
  encodeValuesOnly: false,
  filter: void undefined,
  format: defaultFormat,
  formatter: formats.formatters[defaultFormat],
  // deprecated
  indices: false,
  serializeDate: function serializeDate(date: Date): string {
    return toISO.call(date)
  },
  skipNulls: false,
  strictNullHandling: false
}

var isNonNullishPrimitive = function isNonNullishPrimitive(
  v: unknown
): v is string | number | boolean | symbol | bigint {
  return (
    typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean' ||
    typeof v === 'symbol' ||
    typeof v === 'bigint'
  )
}

var sentinel = {}

var stringify = function stringify(
  object: unknown,
  prefix: string,
  generateArrayPrefix: GenerateArrayPrefix,
  commaRoundTrip: boolean,
  allowEmptyArrays: boolean,
  strictNullHandling: boolean,
  skipNulls: boolean,
  encodeDotInKeys: boolean,
  encoder: Encoder | null,
  filter: FilterFunction | unknown[] | undefined,
  sort: SortFunction | null | undefined,
  allowDots: boolean,
  serializeDate: (date: Date) => unknown,
  format: FormatName,
  formatter: Formatter,
  encodeValuesOnly: boolean,
  charset: string,
  sideChannel: Channel,
  depth: number,
  currentDepth: number
): string | string[] {
  var obj = object

  if (currentDepth > depth) {
    throw new RangeError('Input depth exceeded depth option of ' + depth)
  }

  var tmpSc: Channel | undefined = sideChannel
  var step = 0
  var findFlag = false
  while ((tmpSc = (tmpSc as Channel).get(sentinel) as Channel | undefined) !== void undefined && !findFlag) {
    // Where object last appeared in the ref tree
    var pos = tmpSc.get(object)
    step += 1
    if (typeof pos !== 'undefined') {
      if (pos === step) {
        throw new RangeError('Cyclic object value')
      } else {
        findFlag = true // Break while
      }
    }
    if (typeof tmpSc.get(sentinel) === 'undefined') {
      step = 0
    }
  }

  obj = typeof filter === 'function' ? filter(prefix, obj) : obj

  if (obj instanceof Date) {
    obj = serializeDate(obj)
  } else if (generateArrayPrefix === 'comma' && isArray(obj)) {
    obj = utils.maybeMap(obj, function (value: unknown): unknown {
      if (value instanceof Date) {
        return serializeDate(value)
      }
      return value
    })
  }

  if (obj === null) {
    if (strictNullHandling) {
      return formatter(
        encoder && !encodeValuesOnly ? encoder(prefix, defaults.encoder, charset, 'key', format) : prefix
      )
    }

    obj = ''
  }

  if (isNonNullishPrimitive(obj) || utils.isBuffer(obj)) {
    if (encoder) {
      var keyValue = encodeValuesOnly ? prefix : encoder(prefix, defaults.encoder, charset, 'key', format)
      return [formatter(keyValue) + '=' + formatter(encoder(obj, defaults.encoder, charset, 'value', format))]
    }
    return [formatter(prefix) + '=' + formatter(String(obj))]
  }

  var values: string[] = []

  if (typeof obj === 'undefined') {
    return values
  }

  var objKeys: unknown[]
  if (generateArrayPrefix === 'comma' && isArray(obj)) {
    // we need to join elements in
    if (encodeValuesOnly && encoder) {
      obj = utils.maybeMap(obj, function (v: unknown): unknown {
        return v == null ? v : encoder(v, defaults.encoder, charset, 'value', format)
      })
    }
    objKeys = [
      {
        value: (obj as unknown[]).length > 0 ? (utils.toCoercible(obj) as unknown[]).join(',') || null : void undefined
      }
    ]
  } else if (isArray(filter)) {
    objKeys = filter
  } else {
    var keys = Object.keys(obj as object)
    objKeys = sort ? keys.sort(sort) : keys
  }

  var encodedPrefix = String(prefix)

  var adjustedPrefix = commaRoundTrip && isArray(obj) && obj.length === 1 ? encodedPrefix + '[]' : encodedPrefix

  if (allowEmptyArrays && isArray(obj) && obj.length === 0 && Object.keys(obj).length === 0) {
    return (
      formatter(
        encoder && !encodeValuesOnly
          ? encoder(adjustedPrefix, defaults.encoder, charset, 'key', format)
          : adjustedPrefix
      ) + '[]'
    )
  }

  for (var j = 0; j < objKeys.length; ++j) {
    var key = objKeys[j]
    var value =
      typeof key === 'object' && key && typeof (key as { value?: unknown }).value !== 'undefined'
        ? (key as { value?: unknown }).value
        : (obj as QsRecord)[key as PropertyKey]

    if (skipNulls && value === null) {
      continue
    }

    var encodedKey = allowDots && encodeDotInKeys ? String(key).replace(/\./g, '%2E') : String(key)
    var keyPrefix = isArray(obj)
      ? typeof generateArrayPrefix === 'function'
        ? generateArrayPrefix(adjustedPrefix, encodedKey)
        : adjustedPrefix
      : adjustedPrefix + (allowDots ? '.' + encodedKey : '[' + encodedKey + ']')

    sideChannel.set(object, step)
    var valueSideChannel: Channel = new Map()
    valueSideChannel.set(sentinel, sideChannel)
    pushToArray(
      values,
      stringify(
        value,
        keyPrefix,
        generateArrayPrefix,
        commaRoundTrip,
        allowEmptyArrays,
        strictNullHandling,
        skipNulls,
        encodeDotInKeys,
        generateArrayPrefix === 'comma' && encodeValuesOnly && isArray(obj) ? null : encoder,
        filter,
        sort,
        allowDots,
        serializeDate,
        format,
        formatter,
        encodeValuesOnly,
        charset,
        valueSideChannel,
        depth,
        currentDepth + 1
      )
    )
  }

  return values
}

var normalizeStringifyOptions = function normalizeStringifyOptions(
  opts?: StringifyOptions
): NormalizedStringifyOptions {
  if (!opts) {
    return defaults
  }

  if (typeof opts.allowEmptyArrays !== 'undefined' && typeof opts.allowEmptyArrays !== 'boolean') {
    throw new TypeError('`allowEmptyArrays` option can only be `true` or `false`, when provided')
  }

  if (typeof opts.encodeDotInKeys !== 'undefined' && typeof opts.encodeDotInKeys !== 'boolean') {
    throw new TypeError('`encodeDotInKeys` option can only be `true` or `false`, when provided')
  }

  if (opts.encoder !== null && typeof opts.encoder !== 'undefined' && typeof opts.encoder !== 'function') {
    throw new TypeError('Encoder has to be a function.')
  }

  var charset = opts.charset || defaults.charset
  if (typeof opts.charset !== 'undefined' && opts.charset !== 'utf-8' && opts.charset !== 'iso-8859-1') {
    throw new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined')
  }

  var format: FormatName = formats['default']
  if (typeof opts.format !== 'undefined') {
    if (!has.call(formats.formatters, opts.format)) {
      throw new TypeError('Unknown format option provided.')
    }
    format = opts.format
  }
  var formatter = formats.formatters[format]

  var filter = defaults.filter
  if (typeof opts.filter === 'function' || isArray(opts.filter)) {
    filter = opts.filter
  }

  var arrayFormat: ArrayFormat
  if (has.call(arrayPrefixGenerators, opts.arrayFormat as PropertyKey)) {
    arrayFormat = opts.arrayFormat as ArrayFormat
  } else if ('indices' in opts) {
    arrayFormat = opts.indices ? 'indices' : 'repeat'
  } else {
    arrayFormat = defaults.arrayFormat
  }

  if ('commaRoundTrip' in opts && typeof opts.commaRoundTrip !== 'boolean') {
    throw new TypeError('`commaRoundTrip` must be a boolean, or absent')
  }

  var allowDots =
    typeof opts.allowDots === 'undefined'
      ? opts.encodeDotInKeys === true
        ? true
        : defaults.allowDots
      : !!opts.allowDots

  return {
    addQueryPrefix: typeof opts.addQueryPrefix === 'boolean' ? opts.addQueryPrefix : defaults.addQueryPrefix,
    allowDots: allowDots,
    allowEmptyArrays: typeof opts.allowEmptyArrays === 'boolean' ? !!opts.allowEmptyArrays : defaults.allowEmptyArrays,
    arrayFormat: arrayFormat,
    charset: charset,
    charsetSentinel: typeof opts.charsetSentinel === 'boolean' ? opts.charsetSentinel : defaults.charsetSentinel,
    commaRoundTrip: !!opts.commaRoundTrip,
    delimiter: typeof opts.delimiter === 'undefined' ? defaults.delimiter : opts.delimiter,
    depth: typeof opts.depth === 'number' ? opts.depth : defaults.depth,
    encode: typeof opts.encode === 'boolean' ? opts.encode : defaults.encode,
    encodeDotInKeys: typeof opts.encodeDotInKeys === 'boolean' ? opts.encodeDotInKeys : defaults.encodeDotInKeys,
    encoder: typeof opts.encoder === 'function' ? opts.encoder : defaults.encoder,
    encodeValuesOnly: typeof opts.encodeValuesOnly === 'boolean' ? opts.encodeValuesOnly : defaults.encodeValuesOnly,
    filter: filter,
    format: format,
    formatter: formatter,
    serializeDate: typeof opts.serializeDate === 'function' ? opts.serializeDate : defaults.serializeDate,
    skipNulls: typeof opts.skipNulls === 'boolean' ? opts.skipNulls : defaults.skipNulls,
    sort: typeof opts.sort === 'function' ? opts.sort : null,
    strictNullHandling:
      typeof opts.strictNullHandling === 'boolean' ? opts.strictNullHandling : defaults.strictNullHandling
  }
}

module.exports = function (object: unknown, opts?: StringifyOptions): string {
  var obj = object
  var options = normalizeStringifyOptions(opts)

  var objKeys: unknown[] | undefined
  var filter: FilterFunction | unknown[] | undefined

  if (typeof options.filter === 'function') {
    filter = options.filter
    obj = filter('', obj)
  } else if (isArray(options.filter)) {
    // a copy: `sort` below must not reorder the caller's array, and nested
    // levels take their key order from the sorted copy
    filter = options.filter.slice()
    objKeys = filter
  }

  var keys: string[] = []

  if (typeof obj !== 'object' || obj === null) {
    return ''
  }

  var generateArrayPrefix = arrayPrefixGenerators[options.arrayFormat]
  var commaRoundTrip = generateArrayPrefix === 'comma' && options.commaRoundTrip

  if (!objKeys) {
    objKeys = Object.keys(obj)
  }

  if (options.sort) {
    objKeys.sort(options.sort as (a: unknown, b: unknown) => number)
  }

  var sideChannel: Channel = new Map()
  for (var i = 0; i < objKeys.length; ++i) {
    var key = objKeys[i]

    if (typeof key === 'undefined' || key === null) {
      continue
    }

    var value = (obj as QsRecord)[key as PropertyKey]

    if (options.skipNulls && value === null) {
      continue
    }

    var encodedKey = options.encodeDotInKeys ? String(key).replace(/\./g, '%2E') : String(key)

    pushToArray(
      keys,
      stringify(
        value,
        encodedKey,
        generateArrayPrefix,
        commaRoundTrip,
        options.allowEmptyArrays,
        options.strictNullHandling,
        options.skipNulls,
        options.encodeDotInKeys,
        options.encode ? options.encoder : null,
        filter,
        options.sort,
        options.allowDots,
        options.serializeDate,
        options.format,
        options.formatter,
        options.encodeValuesOnly,
        options.charset,
        sideChannel,
        options.depth,
        0
      )
    )
  }

  var joined = keys.join(options.delimiter)
  var prefix = options.addQueryPrefix === true ? '?' : ''

  if (options.charsetSentinel) {
    if (options.charset === 'iso-8859-1') {
      // encodeURIComponent('&#10003;'), the "numeric entity" representation of a checkmark
      prefix += 'utf8=%26%2310003%3B' + options.delimiter
    } else {
      // encodeURIComponent('✓')
      prefix += 'utf8=%E2%9C%93' + options.delimiter
    }
  }

  return joined.length > 0 ? prefix + joined : ''
}

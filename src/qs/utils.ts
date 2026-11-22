'use strict'

/**
 * Module dependencies.
 *
 * `side-channel` is replaced by `WeakMap` (every key these channels see is an
 * object or an array) and `es-define-property` by `Object.defineProperty`.
 * @private
 */

var formats = require('./formats') as Formats
var defineProperty = Object.defineProperty

import type { FormatName, Formats } from './formats'

/** An object qs builds or reads by key: a plain object (maybe with a null prototype), or an array read by key. */
export type QsRecord = Record<PropertyKey, unknown>

/** The options `merge`, `arrayToObject` and `limitedPair` read (parse's normalized options, or a subset). */
export interface MergeOptions {
  allowPrototypes?: boolean | undefined
  arrayLimit?: number | undefined
  plainObjects?: boolean | undefined
  strictMerge?: boolean | undefined
  throwOnLimitExceeded?: boolean | undefined
}

/** The default encoder's signature, which custom encoders share. */
export type EncodeFunction = (
  str: unknown,
  defaultEncoder?: unknown,
  charset?: string,
  kind?: 'key' | 'value',
  format?: FormatName
) => unknown

/** The default decoder's signature, which custom decoders share. */
export type DecodeFunction = (
  str: string,
  defaultDecoder?: unknown,
  charset?: string,
  kind?: 'key' | 'value'
) => unknown

interface QueueItem {
  obj: QsRecord
  prop: string
}

/** A value whose constructor may say whether it is a Buffer (`isBuffer` checks both at runtime). */
type BufferLike = { constructor: { isBuffer: (obj: unknown) => unknown } }

var has = Object.prototype.hasOwnProperty
var isArray = Array.isArray as (value: unknown) => value is unknown[]

// Track objects created from arrayLimit overflow using side-channel
// Stores the current max numeric index for O(1) lookup
var overflowChannel = new WeakMap<object, number>()

var markOverflow = function markOverflow<T extends object>(obj: T, maxIndex: number): T {
  overflowChannel.set(obj, maxIndex)
  return obj
}

var isOverflow = function isOverflow(obj: unknown): obj is QsRecord {
  return overflowChannel.has(obj as object)
}

var getMaxIndex = function getMaxIndex(obj: object): number {
  return overflowChannel.get(obj) as number
}

var setMaxIndex = function setMaxIndex(obj: object, maxIndex: number): void {
  overflowChannel.set(obj, maxIndex)
}

// Track containers produced by a `strictMerge` conflict wrap, and their current max numeric index,
// so repeated conflicts on one path append instead of nesting a new wrapper each time
var conflictChannel = new WeakMap<object, number>()

var markConflict = function markConflict<T extends object>(obj: T, maxIndex: number): T {
  conflictChannel.set(obj, maxIndex)
  return obj
}

var isConflict = function isConflict(obj: object): boolean {
  return conflictChannel.has(obj)
}

var getConflictIndex = function getConflictIndex(obj: object): number {
  return conflictChannel.get(obj) as number
}

var hexTable = (function () {
  var array: string[] = []
  for (var i = 0; i < 256; ++i) {
    array[array.length] = '%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase()
  }

  return array
})()

var compactQueue = function compactQueue(queue: QueueItem[]): void {
  while (queue.length > 1) {
    var item = queue.pop() as QueueItem
    var obj = item.obj[item.prop]

    if (isArray(obj)) {
      var compacted: unknown[] = []

      for (var j = 0; j < obj.length; ++j) {
        if (typeof obj[j] !== 'undefined') {
          compacted[compacted.length] = obj[j]
        }
      }

      item.obj[item.prop] = compacted
    }
  }
}

var arrayToObject = function arrayToObject(source: ArrayLike<unknown>, options?: MergeOptions): QsRecord {
  var obj: QsRecord = options && options.plainObjects ? { __proto__: null } : {}
  for (var i = 0; i < source.length; ++i) {
    if (typeof source[i] !== 'undefined') {
      obj[i] = source[i]
    }
  }

  return obj
}

var setProperty = function setProperty(obj: object, key: PropertyKey, value: unknown): void {
  if (key === '__proto__' && defineProperty) {
    defineProperty(obj, key, {
      configurable: true,
      enumerable: true,
      value: value,
      writable: true
    })
  } else {
    ;(obj as QsRecord)[key] = value
  }
}

var maxNumericIndex = function maxNumericIndex(obj: object, min: number): number {
  var max = min
  var keys = Object.keys(obj)
  for (var i = 0; i < keys.length; ++i) {
    var num = parseInt(keys[i] as string, 10)
    if (String(num) === keys[i] && num > max) {
      max = num
    }
  }

  return max
}

// parsed arrays stay sparse until `compact`, so `length` would count the holes left by indices like `a[19]`
var countElements = function countElements(arr: unknown[]): number {
  var count = 0
  for (var i = 0; i < arr.length; ++i) {
    if (has.call(arr, i)) {
      count += 1
    }
  }
  return count
}

var limitedPair = function limitedPair(first: unknown, second: unknown, options?: MergeOptions): unknown[] | QsRecord {
  var pair = [first, second]
  if (options && typeof options.arrayLimit === 'number' && pair.length > options.arrayLimit) {
    if (options.throwOnLimitExceeded) {
      throw new RangeError(
        'Array limit exceeded. Only ' +
          options.arrayLimit +
          ' element' +
          (options.arrayLimit === 1 ? '' : 's') +
          ' allowed in an array.'
      )
    }
    return markOverflow(arrayToObject(pair, options), 1)
  }
  return pair
}

var merge = function merge(target: unknown, source: unknown, options?: MergeOptions): unknown {
  /* eslint no-param-reassign: 0 */
  if (!source) {
    return target
  }

  if (typeof source !== 'object' && typeof source !== 'function') {
    if (isArray(target)) {
      var nextIndex = target.length
      if (options && typeof options.arrayLimit === 'number' && countElements(target) >= options.arrayLimit) {
        if (options.throwOnLimitExceeded) {
          throw new RangeError(
            'Array limit exceeded. Only ' +
              options.arrayLimit +
              ' element' +
              (options.arrayLimit === 1 ? '' : 's') +
              ' allowed in an array.'
          )
        }
        return markOverflow(arrayToObject(target.concat(source), options), nextIndex)
      }
      target[nextIndex] = source
    } else if (target && typeof target === 'object') {
      if (isOverflow(target)) {
        // Add at next numeric index for overflow objects
        var newIndex = getMaxIndex(target) + 1
        target[newIndex] = source
        setMaxIndex(target, newIndex)
      } else if (options && options.strictMerge && isConflict(target)) {
        var nextConflict = getConflictIndex(target) + 1
        if (
          options.throwOnLimitExceeded &&
          typeof options.arrayLimit === 'number' &&
          nextConflict >= options.arrayLimit
        ) {
          throw new RangeError(
            'Array limit exceeded. Only ' +
              options.arrayLimit +
              ' element' +
              (options.arrayLimit === 1 ? '' : 's') +
              ' allowed in an array.'
          )
        }
        ;(target as QsRecord)[nextConflict] = source
        markConflict(target, nextConflict)
      } else if (options && options.strictMerge) {
        var conflict = limitedPair(target, source, options)
        return isArray(conflict) ? markConflict(conflict, 1) : conflict
      } else if (
        (options && (options.plainObjects || options.allowPrototypes)) ||
        !has.call(Object.prototype, source as PropertyKey)
      ) {
        ;(target as QsRecord)[source as PropertyKey] = true
      }
    } else {
      return limitedPair(target, source, options)
    }

    return target
  }

  if (!target || typeof target !== 'object') {
    if (isOverflow(source)) {
      // Create new object with target at 0, source values shifted by 1
      var sourceKeys = Object.keys(source)
      var result: QsRecord = options && options.plainObjects ? { __proto__: null, 0: target } : { 0: target }
      for (var m = 0; m < sourceKeys.length; m++) {
        var oldKey = parseInt(sourceKeys[m] as string, 10)
        result[oldKey + 1] = source[sourceKeys[m] as string]
      }
      return markOverflow(result, getMaxIndex(source) + 1)
    }
    var combined = [target].concat(source)
    if (options && typeof options.arrayLimit === 'number' && combined.length > options.arrayLimit) {
      if (options.throwOnLimitExceeded) {
        throw new RangeError(
          'Array limit exceeded. Only ' +
            options.arrayLimit +
            ' element' +
            (options.arrayLimit === 1 ? '' : 's') +
            ' allowed in an array.'
        )
      }
      return markOverflow(arrayToObject(combined, options), combined.length - 1)
    }
    return combined
  }

  var mergeTarget = target as QsRecord
  if (isArray(target) && !isArray(source)) {
    mergeTarget = arrayToObject(target, options)
    if (isConflict(target)) {
      // the array may have grown past its last conflict, so continue after its last index
      markConflict(mergeTarget, target.length - 1)
    }
  }

  if (isArray(target) && isArray(source)) {
    source.forEach(function (item: unknown, i: number): void {
      if (has.call(target, i)) {
        var targetItem = target[i]
        if (targetItem && typeof targetItem === 'object' && item && typeof item === 'object') {
          target[i] = merge(targetItem, item, options)
        } else {
          target[target.length] = item
        }
      } else {
        target[i] = item
      }
    })
    if (options && typeof options.arrayLimit === 'number' && countElements(target) > options.arrayLimit) {
      if (options.throwOnLimitExceeded) {
        throw new RangeError(
          'Array limit exceeded. Only ' +
            options.arrayLimit +
            ' element' +
            (options.arrayLimit === 1 ? '' : 's') +
            ' allowed in an array.'
        )
      }
      return markOverflow(arrayToObject(target, options), target.length - 1)
    }
    return target
  }

  return Object.keys(source).reduce(function (acc: QsRecord, key: string): QsRecord {
    var value = (source as QsRecord)[key]

    if (has.call(acc, key)) {
      setProperty(acc, key, merge(acc[key], value, options))
    } else {
      setProperty(acc, key, value)
    }

    if (isOverflow(source) && !isOverflow(acc)) {
      markOverflow(acc, maxNumericIndex(acc, getMaxIndex(source)))
    }
    if (isOverflow(acc)) {
      var keyNum = parseInt(key, 10)
      if (String(keyNum) === key && keyNum >= 0 && keyNum > getMaxIndex(acc)) {
        setMaxIndex(acc, keyNum)
      }
    }
    if (isConflict(acc)) {
      var conflictKey = parseInt(key, 10)
      if (String(conflictKey) === key && conflictKey > getConflictIndex(acc)) {
        markConflict(acc, conflictKey)
      }
    }

    return acc
  }, mergeTarget)
}

var assign = function assignSingleSource<T extends object>(target: T, source: object): T {
  return Object.keys(source).reduce(function (acc: T, key: string): T {
    setProperty(acc, key, (source as QsRecord)[key])
    return acc
  }, target)
}

var decode = function (str: string, defaultDecoder?: unknown, charset?: string): string {
  // With no `%` there is no escape to expand, in either charset: `unescape` has
  // nothing to match, and `decodeURIComponent` is the identity on such a string
  // (and cannot throw). So only `+` -> ' ' remains, and often not even that.
  if (typeof str === 'string' && str.indexOf('%') === -1) {
    return str.indexOf('+') === -1 ? str : str.replace(/\+/g, ' ')
  }

  var strWithoutPlus = str.replace(/\+/g, ' ')
  if (charset === 'iso-8859-1') {
    // unescape never throws, no try...catch needed:
    return strWithoutPlus.replace(/%[0-9a-f]{2}/gi, unescape)
  }
  // utf-8
  try {
    return decodeURIComponent(strWithoutPlus)
  } catch {
    return strWithoutPlus
  }
}

var hasToPrimitive = typeof Symbol === 'function' && typeof Symbol.toPrimitive === 'symbol'
var arrayJoin = Array.prototype.join
var arrayToString = Array.prototype.toString
var objectToString = Object.prototype.toString

// an object with no callable toString (eg, from JSON, or null-prototype) would make String() or join() throw,
// so it becomes its primitive valueOf or else Object.prototype.toString; arrays are walked like join walks them,
// copied only once an element changes, with an array already being joined becoming '' as engines do for cycles
var toCoercible = function toCoercible(value: unknown, joining?: WeakMap<object, boolean>): unknown {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return value
  }
  if (hasToPrimitive && (value as { [Symbol.toPrimitive]?: unknown })[Symbol.toPrimitive] != null) {
    return value
  }
  if (isArray(value) && value.toString === arrayToString && value.join === arrayJoin) {
    var ancestors = joining || new WeakMap<object, boolean>()
    if (ancestors.has(value)) {
      return ''
    }
    ancestors.set(value, true)
    var copy: unknown[] | undefined
    for (var i = 0; i < value.length; i += 1) {
      var item = value[i]
      var coerced = toCoercible(item, ancestors)
      if (!copy && coerced !== item) {
        copy = []
        for (var j = 0; j < i; j += 1) {
          copy[j] = value[j]
        }
      }
      if (copy) {
        copy[i] = coerced
      }
    }
    ancestors['delete'](value)
    return copy || value
  }
  if (typeof value.toString === 'function') {
    return value
  }
  var valueOf: unknown = value.valueOf
  if (typeof valueOf === 'function') {
    var primitive: unknown = valueOf.call(value)
    if (!primitive || (typeof primitive !== 'object' && typeof primitive !== 'function')) {
      return String(primitive)
    }
  }
  return objectToString.call(value)
}

var limit = 1024

/* eslint operator-linebreak: [2, "before"] */

var encode = function encode(
  str: unknown,
  defaultEncoder?: unknown,
  charset?: string,
  kind?: 'key' | 'value',
  format?: FormatName
): unknown {
  // This code was originally written by Brian White (mscdex) for the io.js core querystring library.
  // It has been adapted here for stricter adherence to RFC 3986
  if ((str as { length?: unknown }).length === 0) {
    return str
  }

  var string = str as string
  if (typeof str === 'symbol') {
    string = Symbol.prototype.toString.call(str)
  } else if (typeof str !== 'string') {
    string = String(toCoercible(str))
  }

  if (charset === 'iso-8859-1') {
    // `escape` leaves `+` untouched, but a literal `+` is decoded back to a space,
    // so it must be percent-encoded to round-trip (the utf-8 path already does this).
    return escape(string)
      .replace(/%u[0-9a-f]{4}/gi, function ($0: string): string {
        return '%26%23' + parseInt($0.slice(2), 16) + '%3B'
      })
      .replace(/\+/g, '%2B')
  }

  var out = ''
  for (var j = 0; j < string.length; j += limit) {
    var segment = string.length >= limit ? string.slice(j, j + limit) : string
    if (j + limit < string.length) {
      var last = segment.charCodeAt(segment.length - 1)
      if (last >= 0xd800 && last <= 0xdbff) {
        segment = segment.slice(0, -1)
        j -= 1
      }
    }
    var arr: string[] = []

    for (var i = 0; i < segment.length; ++i) {
      var c = segment.charCodeAt(i)
      if (
        c === 0x2d || // -
        c === 0x2e || // .
        c === 0x5f || // _
        (c === 0x7e && format !== formats.WHATWG) || // ~
        (c >= 0x30 && c <= 0x39) || // 0-9
        (c >= 0x41 && c <= 0x5a) || // a-z
        (c >= 0x61 && c <= 0x7a) || // A-Z
        (format === formats.RFC1738 && (c === 0x28 || c === 0x29)) || // ( )
        (format === formats.WHATWG && c === 0x2a) // *
      ) {
        arr[arr.length] = segment.charAt(i)
        continue
      }

      if (c < 0x80) {
        arr[arr.length] = hexTable[c] as string
        continue
      }

      if (c < 0x800) {
        arr[arr.length] = (hexTable[0xc0 | (c >> 6)] as string) + hexTable[0x80 | (c & 0x3f)]
        continue
      }

      if (c < 0xd800 || c >= 0xe000) {
        arr[arr.length] =
          (hexTable[0xe0 | (c >> 12)] as string) + hexTable[0x80 | ((c >> 6) & 0x3f)] + hexTable[0x80 | (c & 0x3f)]
        continue
      }

      var next = segment.charCodeAt(i + 1)
      if (c <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
        i += 1
        c = 0x10000 + (((c & 0x3ff) << 10) | (next & 0x3ff))

        arr[arr.length] =
          (hexTable[0xf0 | (c >> 18)] as string) +
          hexTable[0x80 | ((c >> 12) & 0x3f)] +
          hexTable[0x80 | ((c >> 6) & 0x3f)] +
          hexTable[0x80 | (c & 0x3f)]
      } else {
        // a lone surrogate has no UTF-8 encoding; like `URLSearchParams` and `TextEncoder`, emit U+FFFD
        arr[arr.length] = '%EF%BF%BD'
      }
    }

    out += arr.join('')
  }

  return out
}

var compact = function compact(value: unknown): unknown {
  var queue: QueueItem[] = [{ obj: { o: value }, prop: 'o' }]
  var refs = new WeakMap<object, boolean>()

  for (var i = 0; i < queue.length; ++i) {
    var item = queue[i] as QueueItem
    var obj = item.obj[item.prop] as QsRecord

    var keys = Object.keys(obj)
    for (var j = 0; j < keys.length; ++j) {
      var key = keys[j] as string
      var val = obj[key]
      if (typeof val === 'object' && val !== null && !refs.has(val)) {
        queue[queue.length] = { obj: obj, prop: key }
        refs.set(val, true)
      }
    }
  }

  compactQueue(queue)

  return value
}

var isRegExp = function isRegExp(obj: unknown): obj is RegExp {
  return Object.prototype.toString.call(obj) === '[object RegExp]'
}

var isBuffer = function isBuffer(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false
  }

  return !!(
    (obj as BufferLike).constructor &&
    typeof (obj as BufferLike).constructor.isBuffer === 'function' &&
    (obj as BufferLike).constructor.isBuffer(obj)
  )
}

var combine = function combine(
  a: unknown,
  b: unknown,
  arrayLimit: number,
  plainObjects: boolean,
  throwOnLimitExceeded: boolean
): unknown[] | QsRecord {
  // If 'a' is already an overflow object, add to it
  if (isOverflow(a)) {
    if (throwOnLimitExceeded) {
      throw new RangeError(
        'Array limit exceeded. Only ' +
          arrayLimit +
          ' element' +
          (arrayLimit === 1 ? '' : 's') +
          ' allowed in an array.'
      )
    }
    // spread `b` one level, matching the `[].concat(a, b)` used below, so a
    // collection appended to an already-overflowed object is flattened
    // rather than nested under a single index
    var bValues = isArray(b) ? b : [b]
    var newIndex = getMaxIndex(a)
    for (var i = 0; i < bValues.length; ++i) {
      newIndex += 1
      a[newIndex] = bValues[i]
    }
    setMaxIndex(a, newIndex)
    return a
  }

  var result = ([] as unknown[]).concat(a, b)
  if (result.length > arrayLimit) {
    if (throwOnLimitExceeded) {
      throw new RangeError(
        'Array limit exceeded. Only ' +
          arrayLimit +
          ' element' +
          (arrayLimit === 1 ? '' : 's') +
          ' allowed in an array.'
      )
    }
    return markOverflow(arrayToObject(result, { plainObjects: plainObjects }), result.length - 1)
  }
  return result
}

var maybeMap = function maybeMap(val: unknown, fn: (value: unknown) => unknown): unknown {
  if (isArray(val)) {
    var mapped: unknown[] = []
    for (var i = 0; i < val.length; i += 1) {
      mapped[mapped.length] = fn(val[i])
    }
    return mapped
  }
  return fn(val)
}

/** What `require('./utils')` returns. */
export interface Utils {
  arrayToObject: typeof arrayToObject
  assign: typeof assign
  combine: typeof combine
  compact: typeof compact
  decode: DecodeFunction
  encode: EncodeFunction
  isBuffer: typeof isBuffer
  isOverflow: typeof isOverflow
  isRegExp: typeof isRegExp
  markOverflow: typeof markOverflow
  maybeMap: typeof maybeMap
  merge: typeof merge
  setProperty: typeof setProperty
  toCoercible: typeof toCoercible
}

module.exports = {
  arrayToObject: arrayToObject,
  assign: assign,
  combine: combine,
  compact: compact,
  decode: decode,
  encode: encode,
  isBuffer: isBuffer,
  isOverflow: isOverflow,
  isRegExp: isRegExp,
  markOverflow: markOverflow,
  maybeMap: maybeMap,
  merge: merge,
  setProperty: setProperty,
  toCoercible: toCoercible
} satisfies Utils

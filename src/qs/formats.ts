'use strict'

var replace = String.prototype.replace as (this: unknown, searchValue: RegExp, replaceValue: string) => string
var percentTwenties = /%20/g

var Format = {
  RFC1738: 'RFC1738',
  RFC3986: 'RFC3986',
  WHATWG: 'WHATWG'
} as const

/** A `format` option: which characters a key or value keeps unencoded, and how a space is written. */
export type FormatName = (typeof Format)[keyof typeof Format]

/**
 * Applied to every encoded key and value. A custom encoder can return
 * anything, so a formatter takes any value and coerces it to a string.
 */
export type Formatter = (value: unknown) => string

/** What `require('./formats')` returns. */
export interface Formats {
  default: 'RFC3986'
  formatters: Record<FormatName, Formatter>
  RFC1738: 'RFC1738'
  RFC3986: 'RFC3986'
  WHATWG: 'WHATWG'
}

module.exports = {
  default: Format.RFC3986,
  formatters: {
    RFC1738: function (value: unknown): string {
      return replace.call(value, percentTwenties, '+')
    },
    RFC3986: function (value: unknown): string {
      return String(value)
    },
    WHATWG: function (value: unknown): string {
      return replace.call(value, percentTwenties, '+')
    }
  },
  RFC1738: Format.RFC1738,
  RFC3986: Format.RFC3986,
  WHATWG: Format.WHATWG
} satisfies Formats

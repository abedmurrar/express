/*!
 * express
 * MIT Licensed
 */

'use strict'

/** A code Express gives its errors (the list is in docs/api/errors.md). */
export type ErrorCode = `EXPRESS_ERR_${string}`

/**
 * Not in Express 5.3.0. Gives an error Express creates its stable `code`
 * (expressjs/express#6951; the code names follow expressjs/express#6982 by
 * gayanMatch and UlisesGascon). Used by Express and by the vendored router,
 * send and serve-static.
 *
 * The property is defined as the TC39 proposal for `code`
 * (https://github.com/jasnell/proposal-error-code-property) and as `cause`
 * is: own, writable and configurable, but not enumerable. So an app can still
 * assign or delete it, and `JSON.stringify(err)`, `Object.keys(err)`, spreads
 * and `util.inspect(err)` show the same as on Express 5.3.0.
 *
 * The caller creates the error, so its stack starts where it did, without a
 * frame for this function. Only errors Express creates go through here; one
 * that already has a code (Node's `ENOENT` or `ERR_HTTP_HEADERS_SENT`) is
 * passed on untouched.
 *
 * @param {Error} err
 * @param {string} code
 * @return {Error} err
 * @private
 */

export function withCode<E extends Error>(err: E, code: ErrorCode): E {
  return Object.defineProperty(err, 'code', { configurable: true, value: code, writable: true })
}

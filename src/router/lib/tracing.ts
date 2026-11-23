/*!
 * router
 * MIT Licensed
 */

'use strict'

/**
 * Not in router 2.2.0: router 2.3.0's `diagnostics_channel` tracing
 * (pillarjs/router#196 by logaretm, with #207, #215 and #223), ported from
 * its lib/tracing.js and lib/param.js. Every middleware, route handler, error
 * handler and `router.param()` callback the router runs is traced through the
 * `express.router.request` TracingChannel, the same channel and context as
 * router 2.3.0, so a subscriber written for Express with router 2.3.0 works
 * here unchanged. Nothing here runs unless the channel has subscribers.
 * @private
 */

import type { ErrorRequestHandler, Layer, NextFunction, RequestHandler, RouterRequest, RouterResponse } from './layer'

/**
 * Module dependencies.
 *
 * Loaded with `require` and typed with `typeof import(...)`, so the compiled
 * output calls them directly, with no interop helpers in between.
 * @private
 */

const dc = require('node:diagnostics_channel') as typeof import('node:diagnostics_channel')
const isPromise = require('is-promise') as typeof import('is-promise').default
const deprecate = (require('depd') as typeof import('depd'))('router')
const { withCode } = require('../../error-code') as typeof import('../../error-code')

/** A `router.param()` callback, as `index` declares it (`ParamCallback`). */
export type ParamHandler = (
  req: RouterRequest,
  res: RouterResponse,
  next: NextFunction,
  value: string | string[],
  name: string
) => unknown

/** What every event of the `express.router.request` TracingChannel publishes. */
export interface TraceContext {
  req: RouterRequest
  res: RouterResponse
  /** The router's layer (internal: its shape may change between releases). */
  layer: Layer
  /** The function invoked: the handler, or the `router.param()` callback. */
  handler: RequestHandler | ErrorRequestHandler | ParamHandler
  /** The pattern that matched: the route's path, or the path a middleware or router was mounted with. */
  route: string | RegExp | undefined
  /** The parameter's name, for `router.param()` callbacks only. */
  param?: string
  /** The error the invocation reported (`next(err)`, a throw or a rejection). */
  error?: unknown
  /** The error an error handler received. */
  incomingError?: unknown
  /** `true` for error handlers (four arguments). */
  errorHandler?: true
  /** What the invocation returned, or what its promise resolved to. */
  result?: unknown
}

/** The request, with the errors already published for it. */
interface TracedRequest {
  [seenErrors]?: Set<unknown>
}

/**
 * Module variables.
 * @private
 */

export const requestChannel = dc.tracingChannel<unknown, TraceContext>('express.router.request')

// Share error identity tracking across callbacks and router boundaries. Keep
// the registered symbol compatible with separately installed copies of router.
const seenErrors: unique symbol = Symbol.for('router.tracing.publishedErrors') as never

// Remember errors already observed, including those from untraced code or
// route matching. Only the first report from a traced invocation is published.
export function recordError(req: RouterRequest, err: unknown): boolean {
  if (!err || isRoutingSignal(err)) return false

  let seen = (req as RouterRequest & TracedRequest)[seenErrors]
  if (!seen) {
    seen = (req as RouterRequest & TracedRequest)[seenErrors] = new Set()
  } else if (seen.has(err)) {
    return false
  }
  seen.add(err)
  return true
}

/**
 * `'route'` and `'router'` are routing signals, not errors.
 */
function isRoutingSignal(err: unknown): boolean {
  return err === 'route' || err === 'router'
}

/**
 * Record a throw or rejection on the context. A rethrown error isn't published
 * again, but the terminal event still needs it. A routing signal isn't an
 * error, so a sync one finishes like calling next('route') and returning.
 */
export function recordThrown(ctx: TraceContext, err: unknown, sync: boolean): void {
  if (isRoutingSignal(err)) {
    if (sync) ctx.result = undefined

    return
  }
  if (!('error' in ctx)) ctx.error = err
}

/**
 * Forget an error an error handler has dealt with, so a later report of the
 * same object is published again.
 */
function forgetError(req: RouterRequest, err: unknown): void {
  const seen = (req as RouterRequest & TracedRequest)[seenErrors]
  if (seen) seen.delete(err)
}

export function wrapNext(ctx: TraceContext, next: NextFunction): NextFunction {
  // An error received by an error handler did not originate there, even if
  // tracing was disabled at its origin. A replacement error is still reported.
  if (ctx.errorHandler) recordError(ctx.req, ctx.incomingError)

  return function wrappedNext(err) {
    // An error handler that recovers or replaces the error has handled it, so
    // the same object reported later in the request is a new failure.
    if (ctx.errorHandler && err !== ctx.incomingError) forgetError(ctx.req, ctx.incomingError)
    // Routing signals aren't errors. Report a real error once, at its origin,
    // before forwarding it to another callback, layer or enclosing router.
    if (err && recordError(ctx.req, err)) {
      ctx.error = err
      requestChannel.error.publish(ctx)
    }
    next(err)
  }
}

// An error reported before a promise is returned is published before `end`, so
// it's hidden during `end` to keep `result` or `error` there meaning done.
export function publishEnd(ctx: TraceContext, async: boolean): void {
  if (!async || !('error' in ctx)) return requestChannel.end.publish(ctx)

  const error = ctx.error
  delete ctx.error
  requestChannel.end.publish(ctx)
  ctx.error = error
}

export function traceAsyncEnd(ctx: TraceContext): void {
  // Scope completion to asyncStart's bound stores without scheduling more work.
  requestChannel.asyncStart.runStores(ctx, publishAsyncEnd, null, ctx)
}

function publishAsyncEnd(ctx: TraceContext): void {
  requestChannel.asyncEnd.publish(ctx)
}

// Wrap the shared parameter invocation with its tracing context and lifecycle.
export function traceParam(
  fn: ParamHandler,
  ctx: TraceContext,
  next: NextFunction,
  value: string | string[],
  name: string
): void {
  const wrappedNext = wrapNext(ctx, next)
  let async = false
  let ended = false
  let settled = false
  let early: (() => void) | undefined

  requestChannel.start.runStores(ctx, function () {
    try {
      callParam(invoke, ctx.req, ctx.res, wrappedNext, value, name, settle)
    } finally {
      publishEnd(ctx, async)
      ended = true
      if (early) early()
    }
  })

  // Same as layers, a throw skips the assignment so no result is set
  function invoke(
    req: RouterRequest,
    res: RouterResponse,
    next: NextFunction,
    value: string | string[],
    name: string
  ): unknown {
    let ret: unknown
    try {
      ret = fn(req, res, next, value, name)
    } catch (err) {
      recordThrown(ctx, err, true)
      throw err
    }
    async = isPromise(ret)
    if (!async) ctx.result = ret

    return ret
  }

  function settle(value: unknown, rejected?: boolean): void {
    // Same as tracePromise, only the first outcome settles the trace
    if (settled) return
    settled = true
    // Same as layers, a thenable that settles synchronously still settles after `end`
    if (!ended) {
      early = function () {
        finish(value, rejected)
      }

      return
    }
    finish(value, rejected)
  }

  function finish(value: unknown, rejected: boolean | undefined): void {
    if (!rejected) ctx.result = value
    else recordThrown(ctx, value, false)
    traceAsyncEnd(ctx)
  }
}

// router 2.3.0's lib/param.js, which the untraced path shares there. Here
// only the traced path uses it, so the untraced path in index stays as in
// router 2.2.0. A resolved promise may notify tracing, but does not call
// next(). onSettle gets the resolved value, or (reason, true) if the promise
// rejected.
function callParam(
  fn: ParamHandler,
  req: RouterRequest,
  res: RouterResponse,
  next: NextFunction,
  value: string | string[],
  name: string,
  onSettle: (value: unknown, rejected?: boolean) => void
): void {
  try {
    const ret = fn(req, res, next, value, name)
    if (isPromise(ret)) {
      if (!(ret instanceof Promise)) {
        deprecate('parameters that are Promise-like are deprecated, use a native Promise instead')
      }

      try {
        ret.then(onSettle, function (err: unknown) {
          rejected(err || withCode(new Error('Rejected promise'), 'EXPRESS_ERR_REJECTED_PROMISE'))
        })
      } catch (err) {
        // A `then` that throws is a rejection, forwarded verbatim as before
        rejected(err)
      }
    }
  } catch (err) {
    next(err)
  }

  function rejected(err: unknown): void {
    next(err)
    onSettle(err, true)
  }
}

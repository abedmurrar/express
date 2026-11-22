/*!
 * router
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Not in router 2.2.0. Router 2.3.0 adds a file of this name for its own
 * request symbol (`matchedRoute`); the re-sync adds it here. These two are
 * ours: what the routers record on the request so `req.originalRoute`
 * (`./original-route`) can be built when it is read, never while routing.
 * @private
 */

import type { Layer } from './layer'

/** A layer that matched, with what it matched, and the mount it matched under. */
export interface MatchRecord {
  layer: Layer
  /** The router's pathname the layer matched (the whole path, not only the part it took). */
  path: string
  /** Whether a strict router tried the route on "" first (see `addedSlashUrl` in `../index`). */
  noSlash: boolean | undefined
  /** The mount entered before this one, or `undefined` at the top. */
  parent: MatchRecord | undefined
}

/** The mount (a `use()` layer with a path) the request is in, innermost first, set while it is in it. */
export const mountMatch: unique symbol = Symbol('router.mountMatch')

/** The route layer that set `req.route`, kept as long as `req.route` is. */
export const routeMatch: unique symbol = Symbol('router.routeMatch')

/** The request, with the two records. */
export interface MatchedRequest {
  [mountMatch]?: MatchRecord | undefined
  [routeMatch]?: MatchRecord | undefined
}

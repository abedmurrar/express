/*!
 * router
 * MIT Licensed
 */

'use strict'

/**
 * `router.listRoutes()`, ported from router 2.3.0 (pillarjs/router#174 by
 * bjohansebas), and what `app.listRoutes()` needs (expressjs/express#7531 by
 * bjohansebas, open). Nothing here runs while a request is routed.
 *
 * Not in router 2.3.0: mounted Express apps are listed, as the app itself.
 * #7531 lists a sub-app's router instead, which it creates to do so, and an
 * app's router takes the app's routing settings when it is created, so listing
 * an app that isn't set up yet changed how it routes.
 * @private
 */

import type { Router } from '../index'
import type { Layer } from './layer'

/** A mounted router or Express app, as it was passed to `use()`. */
export interface MountedRouter {
  listRoutes?(): RouteInfo[]
}

/** One path registered on a router: a route's, or one a router or an app is mounted at. */
export type RouteInfo = { path: string | RegExp } & (
  | { methods: string[]; router: undefined }
  | { methods: undefined; router: MountedRouter }
)

/**
 * The app behind each `mounted_app` function that `app.use(path, subApp)`
 * adds to the router, so nothing is set on the function itself.
 */
export const mountedApps = new WeakMap<object, MountedRouter>()

/** The `router` getters of the apps whose router has not been created yet. */
export const unusedRouterGetters = new WeakSet<object>()

/** Whether the app's router exists, without creating it. */
export function hasRouter(app: object): boolean {
  const getter = Object.getOwnPropertyDescriptor(app, 'router')?.get

  return getter === undefined || !unusedRouterGetters.has(getter)
}

/** One entry per path of each route, mounted router and mounted app, in order. */
export function listRoutes(router: Router): RouteInfo[] {
  const routes: RouteInfo[] = []

  for (const layer of router.stack) {
    const route = layer.route
    const mounted = route ? undefined : mountedRouter(layer)

    if (!route && !mounted) {
      continue
    }

    const paths = Array.isArray(layer.rawPath) ? layer.rawPath : [layer.rawPath]

    for (const path of paths) {
      // 2.3.0 gives the RegExp the router matches with; a copy here, so that
      // nothing done to an entry reaches the routing
      const info = { path: path instanceof RegExp ? new RegExp(path) : path }

      routes.push(
        route
          ? { ...info, methods: route._methods(true), router: undefined }
          : { ...info, methods: undefined, router: mounted as MountedRouter }
      )
    }
  }

  return routes
}

/**
 * The router or app a `use()` layer mounts. A router is anything with a
 * `stack` array, as in 2.3.0, so routers of other packages are listed too. An
 * app is told as `app.use()` tells it, by its `handle` and `set`, and never
 * through its `router` getter, which would create its router.
 */
function mountedRouter(layer: Layer): MountedRouter | undefined {
  // an error() layer never gets a request, whatever properties it has
  if (layer.errorOnly) {
    return undefined
  }

  const handle = layer.handle as unknown as MountedRouter & { handle?: unknown; set?: unknown; stack?: unknown }

  if (Array.isArray(handle.stack) || (handle.handle && handle.set)) {
    return handle
  }

  return mountedApps.get(handle)
}

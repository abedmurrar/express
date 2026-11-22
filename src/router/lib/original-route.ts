/*!
 * router
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Not in router 2.2.0 or 2.3.0: `req.originalRoute` (expressjs/express#2501),
 * the full path pattern of the route that matched, built when it is read from
 * the records the routers keep (`./symbols`). Express defines the getter on
 * its request prototype.
 * @private
 */

import type { MatchFunction } from 'path-to-regexp'
import type { Params, RouterRequest } from './layer'
import type { MatchedRequest, MatchRecord } from './symbols'

const symbols = require('./symbols') as typeof import('./symbols')
const routeMatch: typeof symbols.routeMatch = symbols.routeMatch

const TRAILING_SLASH_REGEXP = /\/+$/

/**
 * The route's pattern, after the pattern of every mount it is under, joined
 * as `req.baseUrl` joins their paths. `undefined` when no route matched (or
 * `req.route` is not the route the router matched), or when any of those
 * patterns is a RegExp, which has no path form.
 */
export function originalRoute(req: RouterRequest): string | undefined {
  const route = (req as RouterRequest & MatchedRequest)[routeMatch]

  if (route === undefined || route.layer.route !== req.route) {
    return undefined
  }

  let path = ''

  for (let m: MatchRecord | undefined = route; m !== undefined; m = m.parent) {
    const pattern = matchedPattern(m)

    if (typeof pattern !== 'string') {
      return undefined
    }

    // a mount path ends without a slash, as in req.baseUrl ("/" adds nothing)
    path = (m === route ? pattern : pattern.replace(TRAILING_SLASH_REGEXP, '')) + path
  }

  return path
}

/**
 * The pattern the record's layer matched with: its path, or for a path array
 * the first entry that matches what the layer matched, tried in the order the
 * router tried them ("" first for a strict router's route, see `noSlash`).
 */
function matchedPattern(m: MatchRecord): string | RegExp | undefined {
  const rawPath = m.layer.rawPath

  if (!Array.isArray(rawPath)) {
    return rawPath
  }

  const matchers = m.layer.rawMatchers

  return (m.noSlash ? firstMatch(rawPath, matchers, '') : undefined) ?? firstMatch(rawPath, matchers, m.path)
}

function firstMatch(
  rawPath: Array<string | RegExp>,
  matchers: Array<MatchFunction<Params>>,
  path: string
): string | RegExp | undefined {
  for (let i = 0; i < matchers.length; i++) {
    if ((matchers[i] as MatchFunction<Params>)(path) !== false) {
      return rawPath[i]
    }
  }

  return undefined
}

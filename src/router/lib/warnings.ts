/*!
 * router
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Not in router 2.2.0 or 2.3.0: warnings, on the `express:router` debug
 * namespace, about routes that can't work as written. They are worked out
 * when a path or route is registered, and only while that namespace is
 * enabled (`DEBUG=express:router`), so nothing runs per request.
 * @private
 */

import type { Token } from 'path-to-regexp'
import type { Layer, PathParams } from './layer'
import type { Route } from './route'

const { parse } = require('path-to-regexp') as typeof import('path-to-regexp')
const warn = (require('debug') as typeof import('debug'))('express:router')

/** A registered route, with its router and its place in the router's stack. */
interface RouteEntry {
  route: Route
  index: number
}

/** Per router, the first route seen for each method and path. */
const seen = new WeakMap<object, Map<string, RouteEntry>>()

/** The router each tracked route was made by, and its index in the stack. */
const owners = new WeakMap<Route, { router: object; index: number }>()

/**
 * Warn about each string in `path` that no request can match
 * (expressjs/express#2511). `kind` says what registered it, for the message.
 */
export function checkPath(path: PathParams, kind: string): void {
  if (!warn.enabled) {
    return
  }

  const paths = Array.isArray(path) ? (path.flat(Infinity) as Array<string | RegExp>) : [path]

  for (let i = 0; i < paths.length; i++) {
    const p = paths[i]

    if (typeof p !== 'string') {
      continue
    }

    const reason = neverMatches(p)

    if (reason !== undefined) {
      warn('%s path %o can never match: %s', kind, p, reason)
    }
  }
}

/**
 * Remember that `route` was made by `router` at `index`, so a method added
 * to it later can be checked against the router's other routes.
 */
export function trackRoute(router: object, route: Route, index: number): void {
  if (warn.enabled) {
    owners.set(route, { router, index })
  }
}

/**
 * Warn when `route` now handles `method` for a path that an earlier route
 * of the same router already handles with that method.
 */
export function methodAdded(route: Route, method: string): void {
  const owner = owners.get(route)

  if (owner === undefined || !warn.enabled) {
    return
  }

  let routes = seen.get(owner.router)

  if (routes === undefined) {
    routes = new Map()
    seen.set(owner.router, routes)
  }

  const key = method + ' ' + pathKey(route.path)
  const first = routes.get(key)

  if (first === undefined) {
    routes.set(key, { route, index: owner.index })
    return
  }

  if (first.route !== route) {
    warn(
      'duplicate route %s %o: registered at stack index %d (%s) and again at stack index %d (%s); the second runs only when the first calls next()',
      method.toUpperCase(),
      route.path,
      first.index,
      handlerName(first.route, method),
      owner.index,
      handlerName(route, method)
    )
  }
}

/** The name of the route's first handler for `method` ("all" for `.all()`). */
function handlerName(route: Route, method: string): string {
  const want = method === 'all' ? undefined : method

  // a route that has the method has a handler for it
  return (route.stack.find((layer) => layer.method === want) as Layer).name
}

/** A key that is the same for identical paths only. */
function pathKey(path: PathParams): string {
  if (typeof path === 'string') {
    return 's' + path
  }

  if (path instanceof RegExp) {
    return 'r' + String(path)
  }

  return 'a' + JSON.stringify(path.map(pathKey))
}

/**
 * Why no request can match the string path `path`, or `undefined` when one
 * can. Only what the path string proves: the router matches the pathname of
 * `req.url` as Node's HTTP server gives it, which starts with "/" (or is "*",
 * for `OPTIONS *`), has no "?" or "#", and has only the characters Node lets
 * through unencoded: printable ASCII other than the space. Only literal text
 * outside optional groups counts, since a request can match without a group.
 */
function neverMatches(path: string): string | undefined {
  // the layer compiled this path already, so it parses
  const tokens = parse(path).tokens
  const first = tokens[0]

  if (first !== undefined && first.type === 'text' && first.value[0] !== '/' && first.value !== '*') {
    return 'it does not start with "/", and every request path does; write ' + JSON.stringify('/' + path)
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as Token

    if (token.type !== 'text') {
      continue
    }

    for (const char of token.value) {
      const reason = neverInPath(char)

      if (reason !== undefined) {
        return reason
      }
    }
  }

  return undefined
}

/** Why `char` never appears in a request's pathname, or `undefined` when it can. */
function neverInPath(char: string): string | undefined {
  if (char === '?') {
    return 'a "?" starts the query string, so it is never in the path; write "%3F" to match an encoded one'
  }

  if (char === '#') {
    return 'a "#" starts the fragment, which is not part of the path; write "%23" to match an encoded one'
  }

  const code = char.codePointAt(0) as number

  if (code > 0x20 && code < 0x7f) {
    return undefined
  }

  const name = 'U+' + code.toString(16).toUpperCase().padStart(4, '0')
  let encoded: string | undefined

  try {
    encoded = encodeURIComponent(char)
  } catch {
    encoded = undefined
  }

  return (
    JSON.stringify(char) +
    ' (' +
    name +
    ') is never sent unencoded: clients percent-encode it and Node rejects it raw' +
    (encoded === undefined ? '' : '; write ' + JSON.stringify(encoded))
  )
}

'use strict'

// Runs the same router setup on this fork's router and on upstream's (the
// `router` 2.2.0 that Express 5.3.0 installs), sends requests straight into
// both with plain objects (so any method string, or none, can be used), and
// records what each one did: every handler that ran, in order, with the
// request's method, url, baseUrl, params and route path at that moment, and
// how the request ended. The fork's routing fast paths must leave that
// record unchanged.
//
// A setup is data, so the property tests can generate it:
//   { options: { caseSensitive, strict, mergeParams }, stack: [entry...] }
// where an entry is one of
//   { use: path?, id, action? }               router.use([path], handler)
//   { use: path?, router: setup }             router.use([path], subRouter)
//   { route: path, methods: [...], id, action? }  router.route(path)[m](handler)
//   { error: path?, id }                      router.use([path], errorHandler)
//   { param: name, id }                       router.param(name, fn)
// and `action` is what the handler does after logging: 'next' (the
// default), 'route' (next('route')), 'router' (next('router')), 'fail'
// (next(error)), 'throw', or 'post' (sets req.method to POST, then next()).

var path = require('node:path')
var forkRouter = require('../../../lib/router')

var upstreamDir = path.dirname(
  require.resolve('router', { paths: [path.dirname(require.resolve('express-baseline/package.json'))] })
)
var upstreamRouter = require(upstreamDir)

function build(Router, setup, log) {
  var router = new Router(setup.options || {})
  setup.stack.forEach(function (entry) {
    if (entry.param !== undefined) {
      router.param(entry.param, function (req, res, next, value, name) {
        log.push(['param', entry.id, name, value])
        next()
      })
      return
    }
    if (entry.route !== undefined) {
      var route = router.route(entry.route)
      entry.methods.forEach(function (method) {
        route[method](handler(entry, log))
      })
      return
    }
    var fn
    if (entry.router) fn = build(Router, entry.router, log)
    else if (entry.error !== undefined) fn = errorHandler(entry, log)
    else fn = handler(entry, log)
    var at = entry.router ? entry.use : entry.error !== undefined ? entry.error : entry.use
    if (at === undefined) router.use(fn)
    else router.use(at, fn)
  })
  return router
}

function snapshot(req) {
  return {
    method: req.method,
    url: req.url,
    baseUrl: req.baseUrl,
    params: Object.assign({}, req.params),
    route: req.route ? String(req.route.path) : undefined
  }
}

function handler(entry, log) {
  return function (req, res, next) {
    log.push(['run', entry.id, snapshot(req)])
    switch (entry.action) {
      case 'route':
        return next('route')
      case 'router':
        return next('router')
      case 'fail':
        return next(new Error('fail ' + entry.id))
      case 'throw':
        throw new Error('throw ' + entry.id)
      case 'post':
        req.method = 'POST'
        return next()
      default:
        return next()
    }
  }
}

function errorHandler(entry, log) {
  return function (err, req, res, next) {
    log.push(['error', entry.id, describe(err), snapshot(req)])
    next(err)
  }
}

function describe(err) {
  if (!err) return err
  return { message: err.message, status: err.status }
}

// Send one request through a router built from `setup` with `Router`.
// Resolves with the log: handler runs, then ['done', error] or, for the
// automatic OPTIONS response, ['end', headers, body].
function run(Router, setup, method, url) {
  return new Promise(function (resolve) {
    var log = []
    var router = build(Router, setup, log)
    var headers = {}
    var res = {
      setHeader: function (name, value) {
        headers[name] = value
      },
      end: function (body) {
        log.push(['end', headers, body])
        resolve(log)
      }
    }
    router({ method: method, url: url, headers: {} }, res, function (err) {
      log.push(['done', describe(err)])
      resolve(log)
    })
  })
}

// Resolves with both logs, the fork's and upstream's.
async function both(setup, method, url) {
  return {
    fork: await run(forkRouter, setup, method, url),
    upstream: await run(upstreamRouter, setup, method, url)
  }
}

module.exports = {
  run: run,
  both: both,
  forkRouter: forkRouter,
  upstreamRouter: upstreamRouter,
  ForkLayer: require('../../../lib/router/lib/layer'),
  UpstreamLayer: require(path.join(upstreamDir, 'lib', 'layer'))
}

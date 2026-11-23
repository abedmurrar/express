/*!
 * express
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

import type { EventEmitter } from 'node:events'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { ListenOptions } from 'node:net'
import type { Request } from './request'
import type { ExpressResponse, RenderCallback, RenderOptions } from './response'
import type {
  HandlerList,
  HttpMethod,
  HttpMethods,
  LayerHandler,
  NextFunction,
  ParamCallback,
  PathParams,
  Router as RouterInstance,
  RouterConstructor
} from './router'
import type { Route } from './router/lib/route'
import type { QueryParser, TrustFunction } from './utils'
import type { Engine, View as ViewInstance, ViewConstructor, ViewOptions } from './view'

/**
 * Module dependencies.
 *
 * Loaded with `require` and typed with `typeof import(...)`, so the compiled
 * output calls them directly, with no interop helpers in between.
 * @private
 */

const finalhandler = require('finalhandler') as typeof import('finalhandler')
const debug = (require('debug') as typeof import('debug'))('express:application')
const View = require('./view') as ViewConstructor
const http = require('node:http') as typeof import('node:http')
const methods = (require('./utils') as typeof import('./utils')).methods as HttpMethod[]
const compileETag = (require('./utils') as typeof import('./utils')).compileETag
const compileQueryParser = (require('./utils') as typeof import('./utils')).compileQueryParser
const compileTrust = (require('./utils') as typeof import('./utils')).compileTrust
const resolve = (require('node:path') as typeof import('node:path')).resolve
const Router = require('./router') as RouterConstructor
const { withCode } = require('./error-code') as typeof import('./error-code')

/**
 * The settings read with a known type: the defaults `defaultConfiguration()`
 * sets, which `src/request` and `app.render()` rely on. Any other setting
 * reads as `unknown`.
 */
export interface ApplicationSettings {
  env: string
  'query parser fn': QueryParser | undefined
  'subdomain offset': number
  'trust proxy fn': TrustFunction
  view: ViewConstructor
  'view engine': string | undefined
  'view engines': string | string[] | undefined
  views: string | string[]
}

/** `app.post(path, handlers...)` and the other methods: adds a route, returns the app. */
export type ApplicationMethod = (path: PathParams, ...handlers: HandlerList[]) => Application

/** The `app.listen()` callback: called once listening, or with the server's first error. */
export type ListenCallback = (err?: Error) => void

/**
 * An Express application: a request handler function, with the
 * EventEmitter methods and the methods below mixed in by `src/express`.
 * Parameters are as loose as the JavaScript accepts, and each method narrows
 * them the way the JavaScript does.
 */
export interface Application extends EventEmitter, Omit<HttpMethods<ApplicationMethod>, 'get'> {
  (req: IncomingMessage, res: ServerResponse, next?: NextFunction): void
  /** Views found by `app.render()`, by name, when the view cache is on. */
  cache: Record<string, ViewInstance>
  /** Template engines, by file extension (with the dot). */
  engines: Record<string, Engine>
  /** The settings; a mounted app's inherit from its parent's. */
  settings: Record<string, unknown>
  locals: Record<string, unknown>
  /** The path (or paths, or pattern) the app was mounted at. */
  mountpath: PathParams
  /** The app this one is mounted on, set by the parent's `app.use()`. */
  parent?: Application
  /** The base router, created on first use. */
  readonly router: RouterInstance
  /** The prototype set on each request. */
  request: Request
  /** The prototype set on each response. */
  response: ExpressResponse
  init(): void
  defaultConfiguration(): void
  handle(req: Request, res: ExpressResponse, callback?: NextFunction): void
  use(...handlers: HandlerList[]): this
  use(path: PathParams, ...handlers: HandlerList[]): this
  /** Not in Express 5.3.0: defined by `src/express` on each app, not on this prototype object. */
  error(...handlers: HandlerList[]): this
  error(path: PathParams, ...handlers: HandlerList[]): this
  route(path: PathParams): Route
  engine(ext: string, fn: Engine): this
  param(name: string | string[], fn: ParamCallback): this
  set<K extends keyof ApplicationSettings>(setting: K): ApplicationSettings[K]
  set(setting: string): unknown
  set(setting: string, val: unknown): this
  path(): string
  enabled(setting: string): boolean
  disabled(setting: string): boolean
  enable(setting: string): this
  disable(setting: string): this
  /** With one argument, a setting (like `app.set(setting)`); otherwise a GET route. */
  get<K extends keyof ApplicationSettings>(setting: K): ApplicationSettings[K]
  get(setting: string): unknown
  get(path: PathParams, ...handlers: HandlerList[]): this
  all: ApplicationMethod
  render(name: string, callback: RenderCallback): void
  render(name: string, options: RenderOptions | undefined, callback: RenderCallback): void
  /** The arguments of `server.listen()`; a trailing callback also gets the server's first error. */
  listen(port?: number, hostname?: string, backlog?: number, callback?: ListenCallback): Server
  listen(port?: number, hostname?: string, callback?: ListenCallback): Server
  listen(port?: number, backlog?: number, callback?: ListenCallback): Server
  listen(port?: number, callback?: ListenCallback): Server
  listen(path: string, backlog?: number, callback?: ListenCallback): Server
  listen(path: string, callback?: ListenCallback): Server
  listen(options: ListenOptions, callback?: ListenCallback): Server
  listen(handle: unknown, backlog?: number, callback?: ListenCallback): Server
  listen(handle: unknown, callback?: ListenCallback): Server
}

/**
 * Module variables.
 * @private
 */

var flatten = Array.prototype.flat

/**
 * Application prototype.
 */

var app = (exports = module.exports = {}) as Application

/**
 * Variable for trust proxy inheritance back-compat
 * @private
 */

var trustProxyDefaultSymbol = '@@symbol:trust_proxy_default'

/**
 * Initialize the server.
 *
 *   - setup default configuration
 *   - setup default middleware
 *   - setup route reflection methods
 *
 * @private
 */

app.init = function init(this: Application) {
  var router: RouterInstance | null = null

  this.cache = Object.create(null)
  this.engines = Object.create(null)
  this.settings = Object.create(null)

  this.defaultConfiguration()

  // Setup getting to lazily add base router
  Object.defineProperty(this, 'router', {
    configurable: true,
    enumerable: true,
    get: function getrouter(this: Application) {
      if (router === null) {
        router = new Router({
          caseSensitive: this.enabled('case sensitive routing'),
          strict: this.enabled('strict routing'),
          strictMount: this.enabled('strict mount routing')
        })
      }

      return router
    }
  })
}

/**
 * Initialize application configuration.
 * @private
 */

app.defaultConfiguration = function defaultConfiguration(this: Application) {
  var env = process.env.NODE_ENV || 'development'

  // default settings
  this.enable('x-powered-by')
  this.set('etag', 'weak')
  this.set('env', env)
  this.set('query parser', 'simple')
  this.set('subdomain offset', 2)
  this.set('trust proxy', false)

  // trust proxy inherit back-compat
  Object.defineProperty(this.settings, trustProxyDefaultSymbol, {
    configurable: true,
    value: true
  })

  debug('booting in %s mode', env)

  this.on('mount', function onmount(this: Application, parent: Application) {
    // inherit trust proxy
    if (this.settings[trustProxyDefaultSymbol] === true && typeof parent.settings['trust proxy fn'] === 'function') {
      delete this.settings['trust proxy']
      delete this.settings['trust proxy fn']
    }

    // inherit protos
    Object.setPrototypeOf(this.request, parent.request)
    Object.setPrototypeOf(this.response, parent.response)
    Object.setPrototypeOf(this.engines, parent.engines)
    Object.setPrototypeOf(this.settings, parent.settings)
  })

  // setup locals
  this.locals = Object.create(null)

  // top-most app is mounted at /
  this.mountpath = '/'

  // default locals
  this.locals.settings = this.settings

  // default configuration
  this.set('view', View)
  this.set('views', resolve('views'))
  this.set('jsonp callback name', 'callback')

  if (env === 'production') {
    this.enable('view cache')
  }
}

/**
 * Dispatch a req, res pair into the application. Starts pipeline processing.
 *
 * If no callback is provided, then default error handlers will respond
 * in the event of an error bubbling through the stack.
 *
 * @private
 */

app.handle = function handle(this: Application, req: Request, res: ExpressResponse, callback?: NextFunction) {
  // final handler
  var done =
    callback ||
    finalhandler(req, res, {
      env: this.get('env'),
      onerror: logerror.bind(this)
    })

  // set powered by header
  if (this.enabled('x-powered-by')) {
    res.setHeader('X-Powered-By', 'Express')
  }

  // set circular references
  req.res = res
  res.req = req

  var reqProto: object | null = Object.getPrototypeOf(req)
  var resProto: object | null = Object.getPrototypeOf(res)

  // Not in 5.3.0: running inside another Express app (mounted with app.use()
  // or router.use(), or called as its middleware), give the caller back its
  // prototypes when control returns to it, so req.app, req.ip and the rest
  // read the caller's settings again (#7427). 5.3.0 did this only in
  // app.use()'s mounted_app wrapper. A caller that is not an Express app (no
  // req.app) keeps this app's prototypes, as in 5.3.0.
  if (callback && 'app' in req) {
    done = function restoreCaller(err?: unknown) {
      Object.setPrototypeOf(req, reqProto)
      Object.setPrototypeOf(res, resProto)
      callback(err)
    }
  }

  // alter the prototypes, unless app.listen() already made req and res with them
  if (reqProto !== this.request) Object.setPrototypeOf(req, this.request)
  if (resProto !== this.response) Object.setPrototypeOf(res, this.response)

  // setup locals
  if (!res.locals) {
    res.locals = Object.create(null)
  }

  this.router.handle(req, res, done)
}

/**
 * Proxy `Router#use()` to add middleware to the app router.
 * See Router#use() documentation for details.
 *
 * If the _fn_ parameter is an express app, then it will be
 * mounted at the _route_ specified.
 *
 * @public
 */

app.use = function use(this: Application, fn: unknown, ...rest: unknown[]) {
  var offset = 0
  var path: PathParams = '/'

  // default path to '/'
  // disambiguate app.use([fn])
  if (typeof fn !== 'function') {
    var arg: unknown = fn

    while (Array.isArray(arg) && arg.length !== 0) {
      arg = arg[0]
    }

    // first arg is the path
    if (typeof arg !== 'function') {
      offset = 1
      path = fn as PathParams
    }
  }

  // middleware functions, and express apps (told apart below by having handle and set)
  var fns = flatten.call(offset === 0 ? [fn, ...rest] : rest, Infinity) as Array<LayerHandler & Partial<Application>>

  if (fns.length === 0) {
    throw withCode(new TypeError('app.use() requires a middleware function'), 'EXPRESS_ERR_MIDDLEWARE_REQUIRED')
  }

  // get router
  var router = this.router

  fns.forEach(function (this: Application, fn): RouterInstance | void {
    // non-express app
    if (!fn || !fn.handle || !fn.set) {
      return router.use(path, fn)
    }

    debug('.use app under %s', path)
    fn.mountpath = path
    fn.parent = this

    // app.handle gives req and res back this app's prototypes (and .app) when it is done
    router.use(path, function mounted_app(req: Request, res: ExpressResponse, next: NextFunction) {
      fn.handle!(req, res, next)
    })

    // mounted an app
    fn.emit!('mount', this)
  }, this)

  return this
}

/**
 * Proxy to the app `Router#route()`
 * Returns a new `Route` instance for the _path_.
 *
 * Routes are isolated middleware stacks for specific paths.
 * See the Route api docs for details.
 *
 * @public
 */

app.route = function route(this: Application, path: PathParams) {
  return this.router.route(path)
}

/**
 * Register the given template engine callback `fn`
 * as `ext`.
 *
 * By default will `require()` the engine based on the
 * file extension. For example if you try to render
 * a "foo.ejs" file Express will invoke the following internally:
 *
 *     app.engine('ejs', require('ejs').__express);
 *
 * For engines that do not provide `.__express` out of the box,
 * or if you wish to "map" a different extension to the template engine
 * you may use this method. For example mapping the EJS template engine to
 * ".html" files:
 *
 *     app.engine('html', require('ejs').renderFile);
 *
 * In this case EJS provides a `.renderFile()` method with
 * the same signature that Express expects: `(path, options, callback)`,
 * though note that it aliases this method as `ejs.__express` internally
 * so if you're using ".ejs" extensions you don't need to do anything.
 *
 * Some template engines do not follow this convention, the
 * [Consolidate.js](https://github.com/tj/consolidate.js)
 * library was created to map all of node's popular template
 * engines to follow this convention, thus allowing them to
 * work seamlessly within Express.
 *
 * @param {String} ext
 * @param {Function} fn
 * @return {app} for chaining
 * @public
 */

app.engine = function engine(this: Application, ext: string, fn: Engine) {
  if (typeof fn !== 'function') {
    throw withCode(new Error('callback function required'), 'EXPRESS_ERR_ENGINE_CALLBACK_REQUIRED')
  }

  // get file extension
  var extension = ext[0] !== '.' ? '.' + ext : ext

  // store engine
  this.engines[extension] = fn

  return this
}

/**
 * Proxy to `Router#param()` with one added api feature. The _name_ parameter
 * can be an array of names.
 *
 * See the Router#param() docs for more details.
 *
 * @param {String|Array} name
 * @param {Function} fn
 * @return {app} for chaining
 * @public
 */

app.param = function param(this: Application, name: string | string[], fn: ParamCallback) {
  if (Array.isArray(name)) {
    for (var i = 0; i < name.length; i++) {
      this.param(name[i] as string, fn)
    }

    return this
  }

  this.router.param(name, fn)

  return this
}

/**
 * Assign `setting` to `val`, or return `setting`'s value.
 *
 *    app.set('foo', 'bar');
 *    app.set('foo');
 *    // => "bar"
 *
 * Mounted servers inherit their parent server's settings.
 *
 * @param {String} setting
 * @param {*} [val]
 * @return {Server} for chaining
 * @public
 */

app.set = function set(this: Application, setting: string, val?: unknown) {
  if (arguments.length === 1) {
    // app.get(setting)
    return this.settings[setting]
  }

  debug('set "%s" to %o', setting, val)

  // set value
  this.settings[setting] = val

  // trigger matched settings
  switch (setting) {
    case 'etag':
      this.set('etag fn', compileETag(val))
      break
    case 'query parser':
      this.set('query parser fn', compileQueryParser(val))
      break
    case 'trust proxy':
      this.set('trust proxy fn', compileTrust(val))

      // trust proxy inherit back-compat
      Object.defineProperty(this.settings, trustProxyDefaultSymbol, {
        configurable: true,
        value: false
      })

      break
  }

  return this
} as Application['set']

/**
 * Return the app's absolute pathname
 * based on the parent(s) that have
 * mounted it.
 *
 * For example if the application was
 * mounted as "/admin", which itself
 * was mounted as "/blog" then the
 * return value would be "/blog/admin".
 *
 * @return {String}
 * @private
 */

app.path = function path(this: Application): string {
  return this.parent ? this.parent.path() + this.mountpath : ''
}

/**
 * Check if `setting` is enabled (truthy).
 *
 *    app.enabled('foo')
 *    // => false
 *
 *    app.enable('foo')
 *    app.enabled('foo')
 *    // => true
 *
 * @param {String} setting
 * @return {Boolean}
 * @public
 */

app.enabled = function enabled(this: Application, setting: string) {
  return Boolean(this.set(setting))
}

/**
 * Check if `setting` is disabled.
 *
 *    app.disabled('foo')
 *    // => true
 *
 *    app.enable('foo')
 *    app.disabled('foo')
 *    // => false
 *
 * @param {String} setting
 * @return {Boolean}
 * @public
 */

app.disabled = function disabled(this: Application, setting: string) {
  return !this.set(setting)
}

/**
 * Enable `setting`.
 *
 * @param {String} setting
 * @return {app} for chaining
 * @public
 */

app.enable = function enable(this: Application, setting: string) {
  return this.set(setting, true)
}

/**
 * Disable `setting`.
 *
 * @param {String} setting
 * @return {app} for chaining
 * @public
 */

app.disable = function disable(this: Application, setting: string) {
  return this.set(setting, false)
}

/**
 * Delegate `.VERB(...)` calls to `router.VERB(...)`.
 */

methods.forEach(function (method) {
  // assigned through a plain map of methods: `get` is also the setting reader
  ;(app as HttpMethods<unknown>)[method] = function (this: Application, path: PathParams, ...handlers: HandlerList[]) {
    // arguments.length, not handlers.length: app.get() with no arguments is a route, as in Express
    if (method === 'get' && arguments.length === 1) {
      // app.get(setting)
      return this.set(path as string)
    }

    var route = this.route(path)
    route[method].apply(route, handlers)
    return this
  }
})

/**
 * Special-cased "all" method, applying the given route `path`,
 * middleware, and callback to _every_ HTTP method.
 *
 * @param {String} path
 * @param {Function} ...
 * @return {app} for chaining
 * @public
 */

app.all = function all(this: Application, path: PathParams, ...args: HandlerList[]) {
  var route = this.route(path)

  for (var i = 0; i < methods.length; i++) {
    route[methods[i] as HttpMethod].apply(route, args)
  }

  return this
}

/**
 * Render the given view `name` name with `options`
 * and a callback accepting an error and the
 * rendered template string.
 *
 * Example:
 *
 *    app.render('email', { name: 'Tobi' }, function(err, html){
 *      // ...
 *    })
 *
 * @param {String} name
 * @param {Object|Function} options or fn
 * @param {Function} callback
 * @public
 */

app.render = function render(
  this: Application,
  name: string,
  options?: RenderOptions | RenderCallback,
  callback?: RenderCallback
) {
  var cache = this.cache
  // the third argument, or the second (below): a callback is required
  var done = callback as RenderCallback
  var engines = this.engines
  // a function here is replaced with {} below, before opts is read
  var opts = (options || {}) as RenderOptions
  var view: ViewInstance | undefined

  // support callback function as second arg
  if (typeof options === 'function') {
    done = options
    opts = {}
  }

  // merge options
  var renderOptions: RenderOptions = { ...this.locals, ...opts._locals, ...opts }

  // set .cache unless explicitly provided
  if (renderOptions.cache == null) {
    renderOptions.cache = this.enabled('view cache')
  }

  // primed cache
  if (renderOptions.cache) {
    view = cache[name]
  }

  // view
  if (!view) {
    var View = this.get('view')

    var viewOptions: ViewOptions = {
      defaultEngine: this.get('view engine'),
      root: this.get('views'),
      engines: engines
    }

    // only when set, so a custom "view" class gets the same options as before
    var extensions = this.get('view engines')

    if (extensions) {
      viewOptions.extensions = extensions
    }

    view = new View(name, viewOptions)

    if (!view.path) {
      var dirs =
        Array.isArray(view.root) && view.root.length > 1
          ? 'directories "' + view.root.slice(0, -1).join('", "') + '" or "' + view.root[view.root.length - 1] + '"'
          : 'directory "' + view.root + '"'
      // with "view engines", the extensions it tried, in order
      var tried = view.extensions ? ' with extension ' + quotedList(view.extensions) : ''
      var err: Error & { view?: ViewInstance } = withCode(
        new Error('Failed to lookup view "' + name + '" in views ' + dirs + tried),
        'EXPRESS_ERR_VIEW_NOT_FOUND'
      )
      err.view = view
      return done(err)
    }

    // prime the cache
    if (renderOptions.cache) {
      cache[name] = view
    }
  }

  // render
  tryRender(view, renderOptions, done)
}

/**
 * Listen for connections.
 *
 * A node `http.Server` is returned, with this
 * application (which is a `Function`) as its
 * callback. If you wish to create both an HTTP
 * and HTTPS server you may do so with the "http"
 * and "https" modules as shown here:
 *
 *    var http = require('node:http')
 *      , https = require('node:https')
 *      , express = require('express')
 *      , app = express();
 *
 *    http.createServer(app).listen(80);
 *    https.createServer({ ... }, app).listen(443);
 *
 * A trailing callback is called once the server is listening, or with the
 * error when it fails to start. Later server errors are not passed to it.
 *
 * @return {http.Server}
 * @public
 */

app.listen = function listen(this: Application, ...args: unknown[]) {
  var server = http.createServer(
    {
      IncomingMessage: withPrototype(http.IncomingMessage, this.request),
      ServerResponse: withPrototype(http.ServerResponse, this.response)
    },
    this
  )
  if (typeof args[args.length - 1] === 'function') {
    var done = args[args.length - 1] as ListenCallback
    // The error listener only reports a failed start. Once the server is
    // listening it's removed, so a later 'error' goes to the app's own
    // listeners, or is thrown when there are none, as on a server made with
    // http.createServer(). A failed start removes the 'listening' listeners,
    // so the callback runs once either way.
    var onListening = function onListening() {
      server.removeListener('error', onError)
    }
    var onError = function onError(this: Server, err: Error) {
      server.removeListener('listening', onListening)
      server.removeListener('listening', done)
      done.call(this, err)
    }
    server.once('error', onError)
    server.once('listening', onListening)
  }
  return server.listen.apply(server, args as Parameters<Server['listen']>)
}

/**
 * Return a constructor that makes `Base` objects whose prototype already is
 * `proto`, so app.handle() has no prototype to swap for requests on servers
 * made by app.listen(). Each object is checked as it's made: if `proto` no
 * longer inherits from `Base` (its chain was pointed somewhere else, as in
 * the "Prototype" section of the overriding guide), a plain `Base` object
 * is made and app.handle() swaps as before.
 *
 * Idea from upstream PR #7555 by Nigro Simone.
 *
 * @param {Function} Base
 * @param {Object} proto
 * @return {Function}
 * @private
 */

function withPrototype<T extends Function>(Base: T, proto: object): T
function withPrototype(Base: Function, proto: object): Function {
  function WithPrototype() {
    return Reflect.construct(Base, arguments, proto instanceof Base ? WithPrototype : Base)
  }
  WithPrototype.prototype = proto
  return WithPrototype
}

/**
 * Log error using console.error.
 *
 * @param {Error} err
 * @private
 */

function logerror(this: Application, err: unknown) {
  /* istanbul ignore next */
  if (this.get('env') !== 'test') console.error(err)
}

/**
 * Quote a list for an error message: `"a"`, `"a" or "b"`, `"a", "b" or "c"`.
 * @private
 */

function quotedList(items: string[]): string {
  var last = '"' + items[items.length - 1] + '"'

  return items.length > 1 ? '"' + items.slice(0, -1).join('", "') + '" or ' + last : last
}

/**
 * Try rendering a view.
 * @private
 */

function tryRender(view: ViewInstance, options: RenderOptions, callback: RenderCallback) {
  try {
    view.render(options, callback)
  } catch (err) {
    callback(err as Error)
  }
}

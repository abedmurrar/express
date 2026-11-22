/*!
 * express
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 *
 * Loaded with `require` and typed with `typeof import(...)`, so the compiled
 * output calls them directly, with no interop helpers in between.
 * @private
 */

const debug = (require('debug') as typeof import('debug'))('express:view')
const path = require('node:path') as typeof import('node:path')
const fs = require('node:fs') as typeof import('node:fs')

/** The callback a template engine calls when it has rendered: an error, or the output. */
export type RenderCallback = (err: Error | null | undefined, str?: string) => void

/** A template engine, as registered with `app.engine()`: renders the file at `path`. */
export type Engine = (path: string, options: object, callback: RenderCallback) => void

/** The options `app.render()` creates a `View` with. */
export interface ViewOptions {
  /** the default template engine name */
  defaultEngine?: string | undefined
  /** template engine require() cache */
  engines: Record<string, Engine>
  /**
   * the "view engines" setting: more engine extensions to try, in order,
   * after the default engine's, for a name without a known extension
   */
  extensions?: string | string[] | undefined
  /** root path for view lookup */
  root: string | string[]
}

/** A view: a template file found under the view roots, and the engine that renders it. */
export interface View {
  defaultEngine: string | undefined
  ext: string
  name: string
  root: string | string[]
  engine: Engine
  /**
   * The extensions tried, in order, for a name without a known extension,
   * when the "view engines" setting is used. Unset otherwise.
   */
  extensions?: string[]
  path: string | undefined
  lookup(name: string): string | undefined
  render(options: object, callback: RenderCallback): void
  resolve(dir: string, file: string): string | undefined
}

/** The `View` constructor, the default "view" setting. */
export interface ViewConstructor {
  new (name: string, options: ViewOptions): View
  prototype: View
}

/**
 * Module variables.
 * @private
 */

var dirname = path.dirname
var basename = path.basename
var extname = path.extname
var join = path.join
var resolve = path.resolve

/**
 * Module exports.
 * @public
 */

module.exports = View

/**
 * Initialize a new `View` with the given `name`.
 *
 * Options:
 *
 *   - `defaultEngine` the default template engine name
 *   - `engines` template engine require() cache
 *   - `extensions` more engine extensions to try ("view engines" setting)
 *   - `root` root path for view lookup
 *
 * @param {string} name
 * @param {object} options
 * @public
 */

function View(this: View, name: string, options: ViewOptions) {
  var opts = options || {}

  this.defaultEngine = opts.defaultEngine
  this.ext = extname(name)
  this.name = name
  this.root = opts.root

  // a name ending in "." has the extension "." (extname('index.')), which
  // would load the engine module require(''). Unless an engine is
  // registered for ".", it is a name without an extension, so it gets the
  // default engine's, or the usual error when there is none.
  if (this.ext === '.' && !opts.engines['.']) {
    this.ext = ''
  }

  // the "view engines" setting (opt-in): a name without a known extension
  // tries the default engine's extension, then each listed one, in order,
  // and takes the first that has a file
  var extensions = opts.extensions ? engineExtensions(this.defaultEngine, opts.extensions) : undefined

  if (extensions && !knownExtension(this.ext, extensions, opts.engines)) {
    this.extensions = extensions
    this.path = lookupExtensions(this, name, extensions, opts.engines)
    return
  }

  if (!this.ext && !this.defaultEngine) {
    throw new Error('No default engine was specified and no extension was provided.')
  }

  var fileName = name

  if (!this.ext) {
    // get extension from default engine name (set, as checked above)
    var defaultEngine = this.defaultEngine as string
    this.ext = defaultEngine[0] !== '.' ? '.' + defaultEngine : defaultEngine

    fileName += this.ext
  }

  // store loaded engine
  this.engine = loadEngine(opts.engines, this.ext)

  // lookup path
  this.path = this.lookup(fileName)
}

/**
 * The prototype, typed (a function declaration's `prototype` is untyped).
 * @private
 */

const proto = View.prototype as View

/**
 * Lookup view by the given `name`
 *
 * @param {string} name
 * @private
 */

proto.lookup = function lookup(name) {
  var path: string | undefined
  var roots = ([] as string[]).concat(this.root)

  debug('lookup "%s"', name)

  for (var i = 0; i < roots.length && !path; i++) {
    var root = roots[i] as string

    // resolve the path
    var loc = resolve(root, name)
    var dir = dirname(loc)
    var file = basename(loc)

    // resolve the file
    path = this.resolve(dir, file)
  }

  return path
}

/**
 * Render with the given options.
 *
 * @param {object} options
 * @param {function} callback
 * @private
 */

proto.render = function render(options, callback) {
  var sync = true

  debug('render "%s"', this.path)

  // render, normalizing sync callbacks
  this.engine(this.path as string, options, function onRender(this: unknown, ...args) {
    if (!sync) {
      return callback.apply(this, args)
    }

    // keep the context, for the callback below
    var cntx = this

    // force callback to be async
    return process.nextTick(function renderTick() {
      return callback.apply(cntx, args)
    })
  })

  sync = false
}

/**
 * Resolve the file within the given directory.
 *
 * @param {string} dir
 * @param {string} file
 * @private
 */

proto.resolve = function resolve(dir, file) {
  var ext = this.ext

  // <path>.<ext>
  var path = join(dir, file)
  var stat = tryStat(path)

  if (stat && stat.isFile()) {
    return path
  }

  // <path>/index.<ext>
  path = join(dir, basename(file, ext), 'index' + ext)
  stat = tryStat(path)

  if (stat && stat.isFile()) {
    return path
  }

  return undefined
}

/**
 * Lookup `view` by `name` (a name without a known extension) with each of
 * the given extensions in turn, each one in every root before the next one,
 * through `view.lookup`, and take the first that has a file: sets the view's
 * `ext` and `engine` to its own. Undefined when none has; `ext` is then the
 * name's own extension.
 *
 * @param {View} view
 * @param {string} name
 * @param {string[]} extensions
 * @param {object} engines
 * @return {string}
 * @private
 */

function lookupExtensions(
  view: View,
  name: string,
  extensions: string[],
  engines: Record<string, Engine>
): string | undefined {
  var ext = view.ext

  for (var i = 0; i < extensions.length; i++) {
    view.ext = extensions[i] as string

    var path = view.lookup(name + view.ext)

    if (path) {
      view.engine = loadEngine(engines, view.ext)
      return path
    }
  }

  view.ext = ext
  return undefined
}

/**
 * The engine for `ext`: the one registered for it, or one registered in
 * another case ("Eta" for "search.eta"), or else the `__express` export of
 * the module named after it, which is then cached in `engines`.
 *
 * @param {object} engines
 * @param {string} ext
 * @return {function}
 * @private
 */

function loadEngine(engines: Record<string, Engine>, ext: string): Engine {
  var engine = engines[ext] || engineIgnoringCase(engines, ext)

  if (engine) {
    return engine
  }

  // load engine
  var mod = ext.slice(1)
  debug('require "%s"', mod)

  // default engine export
  var fn: unknown = (require(mod) as { __express?: unknown }).__express

  if (typeof fn !== 'function') {
    throw new Error('Module "' + mod + '" does not provide a view engine.')
  }

  return (engines[ext] = fn as Engine)
}

/**
 * The extensions the "view engines" setting tries, in order, each with its
 * leading dot: the default engine's first, then the listed ones, without
 * repeats. Undefined when the setting lists none, so it is off.
 *
 * @param {string} defaultEngine
 * @param {string|string[]} setting
 * @return {string[]}
 * @private
 */

function engineExtensions(defaultEngine: string | undefined, setting: string | string[]): string[] | undefined {
  var listed = ([] as string[]).concat(setting)

  if (listed.length === 0) {
    return undefined
  }

  var extensions: string[] = []

  for (var name of defaultEngine ? [defaultEngine, ...listed] : listed) {
    var ext = name[0] !== '.' ? '.' + name : name

    if (!extensions.includes(ext)) {
      extensions.push(ext)
    }
  }

  return extensions
}

/**
 * Whether `ext` is a known view extension when the "view engines" setting is
 * on: an engine is registered for it (in any case), or it is one of the
 * extensions the setting tries (in any case). Any other extension, and none,
 * is part of the view name.
 *
 * @param {string} ext
 * @param {string[]} extensions
 * @param {object} engines
 * @return {boolean}
 * @private
 */

function knownExtension(ext: string, extensions: string[], engines: Record<string, Engine>): boolean {
  if (!ext) {
    return false
  }

  if (engines[ext] || engineIgnoringCase(engines, ext)) {
    return true
  }

  var wanted = ext.toLowerCase()

  return extensions.some(function sameExtension(known) {
    return known.toLowerCase() === wanted
  })
}

/**
 * Find an engine registered for `ext` in another case, such as `.Eta` for
 * `.eta`. `for...in` also walks the engines a sub-app inherits from its
 * parent, after its own. Undefined when there is none.
 *
 * @param {object} engines
 * @param {string} ext
 * @return {function}
 * @private
 */

function engineIgnoringCase(engines: Record<string, Engine>, ext: string): Engine | undefined {
  var wanted = ext.toLowerCase()

  for (var key in engines) {
    var engine = engines[key]

    if (engine && key.toLowerCase() === wanted) {
      return engine
    }
  }

  return undefined
}

/**
 * Return a stat, maybe.
 *
 * @param {string} path
 * @return {fs.Stats}
 * @private
 */

function tryStat(path: string): import('node:fs').Stats | undefined {
  debug('stat "%s"', path)

  try {
    return fs.statSync(path)
  } catch {
    return undefined
  }
}

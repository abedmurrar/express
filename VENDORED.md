# Vendored packages

This fork keeps its own copies of the packages it needs to change. Each one keeps its MIT licence and copyright lines in its folder. Every change we make to a copy is listed below, so we can re-sync from upstream later.

| Package | Upstream | Version | Upstream commit | Our copy | Tests |
|---|---|---|---|---|---|
| `router` | https://github.com/pillarjs/router | 2.2.0 | `e6d6b60` | `src/router/` | `test/router/` |
| `send` | https://github.com/pillarjs/send | 1.2.1 | `096a6148` | `src/send/` | `test/send/` (plus `test/send/fixtures/`) |

Why these two: most of the routing bugs and routing performance work are in `router`. The empty-body bug for `/proc` files (#4944) is in `send`.

Both copies are the same versions Express 5.3.0 installs here, and match the installed packages line for line except for the edits listed below.

`router` 2.3.0 (published 2026-11-17) is not vendored yet. This machine's npm config only accepts releases at least 7 days old, so it waits until 2026-11-24 and goes in as a re-sync. It fixes a rewritten `req.url` losing a slash in a mounted router (upstream issue #4059, pillarjs/router#206), and adds `router.listRoutes()` (pillarjs/router#174) and request tracing channels (pillarjs/router#196).

`express.static` still uses the `serve-static` package, which brings its own copy of `send`. Our `lib/send` is used only by `res.sendFile` and `res.download`.

## Changes from upstream

### router

- `src/router/index.js`: added `const { Buffer } = require('node:buffer')` to match Express's lint rule against the global `Buffer`. No behaviour change.
- `src/router/index.js`: renamed two function names so no file has two functions with the same name, which the coverage merge (`lcov` 2) rejects. `Router.prototype.handle` is now `function handleRequest`, and the inner `param` helper in `processParams` is now `nextParam`. Property names are unchanged; only stack-trace frame names differ. The route layer's handler keeps the name `handle`, because tools read it through `layer.name`.

- `src/router/index.js`: the function used as `Router.prototype` is now named `RouterPrototype`, so c8's lcov report doesn't list two functions called `Router`, which breaks the CI coverage merge. It also carries a `/* c8 ignore next */`, because it exists only so routers inherit from `Function` and is never called. Upstream marked it with `istanbul ignore` for the same reason.
- The three files are strict TypeScript: `src/router/lib/layer.ts`, `src/router/lib/route.ts` and `src/router/index.ts`. Only types were added: the statements, their order, the function names and the comments are upstream's, and the compiled `lib/` files differ from the JavaScript build only in the lines below. When re-syncing, apply upstream's JavaScript changes to these files and type the new lines the same way. Dependencies are loaded with `require` and typed with `typeof import(...)`, and the types each file exports (the request and response views, the handler types and the `Layer`, `Route` and `Router` interfaces) are declared after the `require` lines. The lines that read differently from upstream:
  - `layer.ts`: the prototype methods are assigned through `const proto = Layer.prototype as Layer` (`proto.handleError = ...` instead of `Layer.prototype.handleError = ...`), because a function declaration's `prototype` is untyped. The no-`new` call is `new (Layer as LayerConstructor)(path, options, fn)`. `err.status = 400` in `decodeParam` is written `;(err as URIError & { status: number }).status = 400`. `decodeParam` and `loosen` gained overload signatures, so their JSDoc comments sit above those.
  - `route.ts`: the prototype methods are assigned through `const proto = Route.prototype as Route`, including the generated ones (`proto[method] = function (handler) {...}`). `methods` is cast to the `HttpMethod` union. The flattened handler lists are declared `unknown[]`, and each handler is passed to `Layer` as `fn as LayerHandler` after the existing `typeof fn !== 'function'` check. A few indexed reads carry a cast where the loop bounds already guarantee the value (`stack[idx++] as LayerInstance`, `methods[i] as string`, `this.methods[name as string]`).
  - `index.ts`: the prototype methods are assigned through `const proto = Router.prototype as Router`, which comes right after `Router.prototype = function RouterPrototype() {}` (its `istanbul` and `c8 ignore` comments are unchanged). The no-`new` call is `new (Router as RouterConstructor)(options)`. Inside `Router`, the inner `router` function is cast where TypeScript can't see its prototype: `;(router as Router).handle(req, res, next)` (Biome adds the leading `;`, which compiles to an empty statement), `router.stack = [] as LayerInstance[]` and `return router as Router`. `methods` is cast to `Array<HttpMethod | 'all'>`. `processParams` declares `key`, `paramVal`, `paramCallbacks` and `paramCalled` with their set types and casts them where `nextParam` assigns them, because `paramCallback` reads them from a closure. `req.params` gets `layer.params as Params` and `layerPath` gets `layer.path as string` (both set once the layer matched). `getPathname` casts the `parseurl` result to `Url`, keeping upstream's `try`/`catch`. `restore` gained an overload signature (so its JSDoc comment sits above it) and builds its arrays with `new Array<K>(...)` and `new Array<T[K]>(...)`, which compile to the same `new Array(...)`.

### router tests

- `require('..')` changed to `require('../../lib/router')`.
- Removed the first-line `const { it, describe } = require('mocha')` from the 7 router test files, so they use the test runner's globals (Vitest).
- Added `require('node:buffer')` in `support/utils.js`, `router.js` and `route.js`, for the same lint rule.

### send

- `src/send/index.js`: added `var Buffer = require('node:buffer').Buffer`, for the same lint rule. No behaviour change.
- `src/send/index.js`: renamed function names for the same coverage reason. `SendStream.prototype.send` is now `function sendPath`, and the two inner `next` helpers in `sendFile` and `sendIndex` are now `nextExtension` and `nextIndex`. The exported `send` function keeps its name.

- `src/send/index.js`: `hasListeners` calls `emitter.listenerCount(type)` directly. The fallback for emitters without `listenerCount` can't run on any Node version we support (it has existed since Node 3.2).
- `src/send/index.js`: `SendStream.prototype.error` no longer falls back to `String(status)` when a status has no standard message. Every caller passes 400, 403, 404, 412, 416 or 500, so the fallback could never run.

- `src/send/index.js`: `SendStream.prototype.send` wraps `this.setHeader(path, stat)` in a try/catch and passes a throw to `this.error(500, err)`. A throwing `headers` listener (for example Express's `res.sendFile` `headers` option with a CR or LF in a value) used to be an uncaught exception, because it runs in an `fs.stat` callback. Not in upstream.
- The file is strict TypeScript: `src/send/index.ts`. Only types were added: the statements, their order, the `var` declarations, the function names and the comments are upstream's (with the edits above). When re-syncing, apply upstream's JavaScript changes to this file and type the new lines the same way. Dependencies are loaded with `require` and typed with `typeof import(...)`, and the types the file exports (`SendOptions`, `SendStream`, `SendFunction` and `SendErrorDetails`) are declared after the `require` lines. The compiled `lib/send/index.js` differs from the JavaScript build only in the prototype assignments (`proto.error = ...` instead of `SendStream.prototype.error = ...`, after `const proto = SendStream.prototype as SendStream`) and in TypeScript's `__esModule` marker, which lands on the `exports` object that `module.exports = send` replaces. The lines that read differently from upstream:
  - The `require` lines: `Buffer` is `(require('node:buffer') as typeof import('node:buffer')).Buffer` and `debug` is `(require('debug') as typeof import('debug'))('send')`.
  - `send`: `new (SendStream as unknown as SendStreamConstructor)(req, path, options)`, because `SendStream` is only ever called with `new`.
  - `SendStream`: takes `this: SendStreamInit`, the stream type with `_maxage` widened to `number | string | undefined` for the three lines that convert the option to milliseconds. The second of them calls `ms(this._maxage as StringValue)`.
  - The prototype methods are assigned through `const proto = SendStream.prototype as SendStream`, which comes right after `util.inherits(SendStream, Stream)`.
  - `error`: `function error(status, err): boolean | void`. It returns `this.emit(...)` when there are `error` listeners and nothing otherwise, which `noImplicitReturns` only accepts with that return type.
  - `isRangeFresh`: `ifRange.indexOf(etag as string)`.
  - `pipe`: `this.res = res as unknown as ServerResponse`. `pipe` keeps `Stream`'s generic signature, which it overrides, so the response comes in typed as a writable stream.
  - `pipe`: `var parts: string[]`.
  - `send` (`sendPath`): `var opts: SendOptions = {}`, `var ranges: string | undefined | RangeResult | Ranges = req.headers.range`, `this.error(500, err as Error)` in our try/catch, `BYTES_RANGE_REGEXP.test(ranges as string)`, `parseRange(len, ranges as string, {`, and `(ranges[0] as Range)` in the two lines that adjust `offset` and `len`.
  - `sendFile` and `sendIndex`: `nextExtension(err?: NodeJS.ErrnoException)` and `nextIndex(err?: NodeJS.ErrnoException)`, and `join(path, self._index[i] as string)`.
  - `containsDotFile`: `var part = parts[i] as string`. `setHeaders`: `var key = keys[i] as string` and `headers[key] as OutgoingHttpHeader`.
  - `normalizeList`: `([] as string[]).concat(val || [])`.
  - `parseHttpDate`: `Date.parse(date as string)`. A header value can be a number, which `Date.parse` turns into a string, as before.
  - `parseTokenList`: `var list: string[] = []`.
  - Every other line gained parameter and return types only.

### send tests

- `require('..')` changed to `require('../../lib/send')`.
- `test/send/fork-additions.js` is ours, not upstream's: it covers a trailing-separator path that stats as a file (possible on Windows).

## Formatting

Our copies of `router` and `send` live in `src/` and are compiled into `lib/` with the rest of the code. They, and their tests, are formatted with Biome like the rest of the repo (the commit listed in `.git-blame-ignore-revs`), and their unused catch bindings are written as `catch {}`. When re-syncing, diff upstream's changes between versions and apply them by hand; don't copy upstream files over ours. The `eslint-disable` comments in the copied tests are left as they are. They do nothing now.

## Dependencies

These were moved from the vendored packages to Express's own `dependencies`: `is-promise` and `path-to-regexp` (router), and `ms` (send). `run-series` was added to `devDependencies` for the router tests.

## Re-syncing

1. Check the upstream releases after the version above.
2. Diff upstream between our commit and the new tag.
3. Apply the changes by hand, keeping the edits listed above.
4. Update this file.
5. Run `npm test` and the differential harness.

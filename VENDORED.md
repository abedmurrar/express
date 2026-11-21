# Vendored packages

This fork keeps its own copies of the packages it needs to change. Each one keeps its MIT licence and copyright lines in its folder. Every change we make to a copy is listed below, so we can re-sync from upstream later.

| Package | Upstream | Version | Upstream commit | Our copy | Tests |
|---|---|---|---|---|---|
| `router` | https://github.com/pillarjs/router | 2.2.0 | `e6d6b60` | `src/router/` | `test/router/` |
| `send` | https://github.com/pillarjs/send | 1.2.1 | `096a6148` | `src/send/` | `test/send/` (plus `test/send/fixtures/`) |
| `serve-static` | https://github.com/abedmurrar/serve-static (our fork of https://github.com/expressjs/serve-static) | 2.2.1 | `76312e12` | `src/serve-static/` | `test/serve-static/` (plus `test/serve-static/fixtures/`) |

Why these three: most of the routing bugs and routing performance work are in `router`. The empty-body bug for `/proc` files (#4944) is in `send`. `serve-static` is vendored so that `express.static` uses our `send` and gets its fixes: with the `send` that the npm package installs, a `setHeaders` function that throws crashes the process.

All three copies are the same versions Express 5.3.0 installs here, and match the installed packages line for line except for the edits listed below.

`serve-static`'s source is our fork, https://github.com/abedmurrar/serve-static, created from expressjs/serve-static with only its default branch. Nothing is pushed to it yet: its `master` is upstream's, and the vendored code is upstream's tag `v2.2.1` (commit `76312e12c2754c226a685201ff43d785455d0590`, which the fork's `master` contains; the fork has no tags). Upstream's `master` has one later change to `index.js`, a comment typo fix (`fall-though` to `fall-through`, expressjs/serve-static#246), which is not released and not in our copy.

`router` 2.3.0 (published 2026-11-17) is not vendored yet. This machine's npm config only accepts releases at least 7 days old, so it waits until 2026-11-24 and goes in as a re-sync. It fixes a rewritten `req.url` losing a slash in a mounted router (upstream issue #4059, pillarjs/router#206), and adds `router.listRoutes()` (pillarjs/router#174) and request tracing channels (pillarjs/router#196).

`express.static` is our `lib/serve-static`, which loads our `lib/send`, so `express.static`, `res.sendFile` and `res.download` all use the same `send`. The `serve-static` package (and the npm `send` it brings) is no longer a dependency; npm still installs both for the development-only `express-baseline` (Express 5.3.0, the differential harness's baseline).

## Changes from upstream

### router

- `src/router/index.js`: added `const { Buffer } = require('node:buffer')` to match Express's lint rule against the global `Buffer`. No behaviour change.
- `src/router/index.js`: renamed two function names so no file has two functions with the same name, which the coverage merge (`lcov` 2) rejects. `Router.prototype.handle` is now `function handleRequest`, and the inner `param` helper in `processParams` is now `nextParam`. Property names are unchanged; only stack-trace frame names differ. The route layer's handler keeps the name `handle`, because tools read it through `layer.name`.

- `src/router/index.js`: the function used as `Router.prototype` is now named `RouterPrototype`, so c8's lcov report doesn't list two functions called `Router`, which breaks the CI coverage merge. It also carries a `/* c8 ignore next */`, because it exists only so routers inherit from `Function` and is never called. Upstream marked it with `istanbul ignore` for the same reason.
- The three files are strict TypeScript: `src/router/lib/layer.ts`, `src/router/lib/route.ts` and `src/router/index.ts`. Only types were added: the statements, their order, the function names and the comments are upstream's, and the compiled `lib/` files differ from the JavaScript build only in the lines below. When re-syncing, apply upstream's JavaScript changes to these files and type the new lines the same way. Dependencies are loaded with `require` and typed with `typeof import(...)`, and the types each file exports (the request and response views, the handler types and the `Layer`, `Route` and `Router` interfaces) are declared after the `require` lines. `RouterRequest` and `RouterResponse` are aliases of Express's `Request` (`src/request`) and `ExpressResponse` (`src/response`), imported with `import type`, so the compiled router still requires nothing from Express. The lines that read differently from upstream:
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

### serve-static

- `src/serve-static/index.ts`: `require('send')` changed to `require('../send')`, so `express.static` uses our `send`. This is the point of vendoring it: our `send` catches a throw from a `headers` listener (see the `send` edits above), which is how `setHeaders` runs.
- `src/serve-static/index.ts`: added `var Buffer = require('node:buffer').Buffer`, for the same lint rule as in `send`. No behaviour change.
- `src/serve-static/index.ts`: the exported function is declared as `function createServeStatic` instead of `function serveStatic`, for the same coverage reason as in `router` and `send`: the middleware it returns is also called `serveStatic`, and lcov rejects a file with two functions of the same name. Right after `module.exports = createServeStatic` comes `Object.defineProperty(createServeStatic, 'name', { value: 'serveStatic' })`, so `express.static.name` is still `serveStatic`, with the same descriptor, the same length (2) and the same own property names (`length`, `name`, `prototype`), and stack traces still show `serveStatic` (V8 reads the `name` property for them). Only the coverage report sees `createServeStatic`. The middleware keeps its name, `serveStatic`, which tools read through `layer.name`.
- The file is strict TypeScript: `src/serve-static/index.ts`. Only types were added: the statements, their order, the `var` declarations, the other function names and the comments are upstream's (with the edits above). When re-syncing, apply upstream's JavaScript changes to this file and type the new lines the same way. Dependencies are loaded with `require` and typed with `typeof import(...)` (`send` with the `SendFunction` type that `src/send` exports), and the types the file exports (`ServeStaticOptions`, which extends `SendOptions` with `fallthrough`, `redirect` and `setHeaders`, `ServeStaticHandler` and `ServeStaticFunction`) are declared after the `require` lines. The compiled `lib/serve-static/index.js` differs from the JavaScript build only in the lines above and in TypeScript's `__esModule` marker, which lands on the `exports` object that `module.exports = createServeStatic` replaces. The lines that read differently from upstream:
  - The `require` lines: `Buffer` is `(require('node:buffer') as typeof import('node:buffer')).Buffer`, `resolve` is `(require('path') as typeof import('path')).resolve` and `send` is `require('../send') as SendFunction`.
  - `serveStatic` (`createServeStatic`): `var opts = Object.create(options || null) as ServeStaticOptions`.
  - The middleware: `var originalUrl = parseUrl.original(req) as Url`, `var path = (parseUrl(req) as Url).pathname as string` and `(originalUrl.pathname as string).substr(-1)`. `parseurl` is typed as returning `undefined` for a request without a URL, which a request handled by a server always has.
  - The `error` listener: `function error(err: HttpError)`. `send` only emits `http-errors` errors, whose `statusCode` is always a number.
  - The directory listeners: `function notFound(this: SendStream)` and `function redirect(this: SendStream, res: ServerResponse)`, because `send` calls them with the stream as `this`. `redirect` reads `parseUrl.original(this.req) as Url`.
  - Every other line gained parameter and return types only.

### serve-static tests

- `test/serve-static/test.js` is upstream's `test/test.js`. `require('..')` changed to `require('../../lib/serve-static')`, and `var { Buffer } = require('node:buffer')` is added, for the same lint rule.
- The fixtures are copied unchanged into `test/serve-static/fixtures/`, including `.hidden` and `snow ☃/.gitkeep`. Upstream's `test/.eslintrc` (which only sets mocha's environment) is not copied.
- The same 92 tests pass against the vendored copy and against the npm `serve-static` 2.2.1.

### send tests

- `require('..')` changed to `require('../../lib/send')`.
- `test/send/fork-additions.js` is ours, not upstream's: it covers a trailing-separator path that stats as a file (possible on Windows).

## Formatting

Our copies of `router`, `send` and `serve-static` live in `src/` and are compiled into `lib/` with the rest of the code. They, and their tests, are formatted with Biome like the rest of the repo (the commit listed in `.git-blame-ignore-revs`), and their unused catch bindings are written as `catch {}`. When re-syncing, diff upstream's changes between versions and apply them by hand; don't copy upstream files over ours. The `eslint-disable` comments in the copied tests are left as they are. They do nothing now. `serve-static` came in after that commit and was formatted in the commit that vendored it, so Biome's layout (the `onDirectory` and `collapseLeadingSlashes` ternaries on one line, `createHtmlDocument`'s return in parentheses, and the chained supertest calls in its tests joined up) is part of that diff.

## Dependencies

These were moved from the vendored packages to Express's own `dependencies`: `is-promise` and `path-to-regexp` (router), and `ms` (send). `run-series` was added to `devDependencies` for the router tests. `serve-static`'s own dependencies (`encodeurl`, `escape-html`, `parseurl` and `send`) were already Express dependencies or are vendored, so it needed nothing new; `serve-static` itself and `@types/serve-static` (used only by the old `require('serve-static')` in `src/express.ts`) were removed.

## Re-syncing

1. Check the upstream releases after the version above.
2. Diff upstream between our commit and the new tag.
3. Apply the changes by hand, keeping the edits listed above.
4. Update this file.
5. Run `npm test` and the differential harness.

---
title: Differences from Express 5.3.0
description: Everything abedmurrar/express has changed compared with Express 5.3.0, as listed in its changelog.
---

# Differences from Express 5.3.0

So far the fork changes **how Express is tested and built**, not how it behaves: an app gets the same responses as on Express 5.3.0, except where 5.3.0 crashes the process or has a bug the fork fixes (see below). Bug fixes, speed-ups and strict TypeScript come next, on the same drop-in line (see the [roadmap](./roadmap)).

The full list is the "Unreleased (fork)" section of [History.md](https://github.com/abedmurrar/express/blob/master/History.md).

## Runtime

- **Node.js 22, 24 and 26 only.** `engines` is `>= 22`. Express 5.3.0 supports Node.js 18 and later. CI runs the three supported versions on Linux and Windows.
- **Our own copies of `router`, `send`, `serve-static`, `qs` and `body-parser`.** `router` 2.2.0, `send` 1.2.1, `serve-static` 2.2.1, `qs` 6.17.1 and `body-parser` 2.4.0 are vendored into `lib/router`, `lib/send`, `lib/serve-static`, `lib/qs` and `lib/body-parser`, with their licences and test suites, so routing, file-sending, query-parsing and body-parsing bugs can be fixed in the fork. They're the same versions Express 5.3.0 installs, and `express.static` now uses the same `send` as `res.sendFile` and `res.download`. The extended query parser and `express.urlencoded({ extended: true })` use our `qs`, which needs no dependencies (it uses `WeakMap` and `Map` in place of `side-channel`). See [VENDORED.md](https://github.com/abedmurrar/express/blob/master/VENDORED.md).
- **A throwing `headers` listener no longer crashes the process.** A bad value in the `headers` option of `res.sendFile` or `res.download` (a CR or LF, or an invalid header name), or an `express.static` `setHeaders` function that throws, used to throw inside a file-stat callback and end the process on Express 5.3.0. The error now goes to the callback, or to `next(err)` and the app's error handler.
- **No per-request prototype swap on `app.listen()` servers.** The server makes `req` and `res` with the app's prototypes already set, so `app.handle()` has nothing to swap. Apps see the same objects as before. The only visible difference: code that runs before the app on that server, such as an `upgrade`, `connect` or `checkContinue` listener, now gets `req` and `res` that already have the app's prototypes.
- **`res.send` sends binary bodies byte for byte.** An ArrayBuffer, SharedArrayBuffer, DataView or any typed array is sent as the bytes it covers. Express 5.3.0 sent an ArrayBuffer as `{}`, a DataView as nothing, and a `Uint16Array` or `Float64Array` one byte per element, or answered 500.
- **`res.set` keeps an unknown Content-Type as given.** `res.set('Content-Type', 'custom-type')` sends `custom-type`, where Express 5.3.0 sent `false`. `res.send`, `res.json` and `res.sendFile` then keep it too, where 5.3.0 used their default type.
- **`res.redirect` sends no Content-Length with Transfer-Encoding**, as `res.send` already did, so clients accept the response.
- **`res.cookie` honours `expires: 0`** with a `maxAge`: the cookie gets `Max-Age` and no `Expires`.
- **`res.jsonp` falls back to JSON** when the callback name has no allowed characters, instead of sending JavaScript that doesn't parse.
- **`res.sendFile` and `res.download` honour a per-call `etag` option.** The app's `etag` setting is only the default, and the options object you pass is no longer changed.
- **RegExp paths with `g` or `y` match on every request.** In Express 5.3.0 such a RegExp kept its `lastIndex` between requests and matched only every other request, which let requests past a guard like `app.use(/^\/admin/g, auth)`. The fork starts every match at index 0.
- **Fewer dependencies.** The `merge-descriptors`, `once` and `wrappy` packages are gone, replaced by short built-in equivalents with the same behaviour. With `body-parser` and `qs` vendored, `qs` and the 18 packages it brought (`side-channel` and its chain) are gone too: a production install has 38 packages instead of 58.
- **Project links** in `package.json` point to the fork, and upstream's `funding` entry is removed.
- **Built-in TypeScript types.** The package ships types ported from `@types/express` 5.0.6 and `@types/express-serve-static-core` 5.1.3, so `@types/express` is no longer needed and code written for it compiles unchanged. See [Install the fork](./install#typescript).
- **An ES module entry.** `import` loads `index.mjs`, a thin wrapper over the CommonJS build with the same named exports Node gives Express 5.3.0, so `import` and `require` share one copy of Express. `package.json` now has an `exports` map; it keeps `require('express')`, `require('express/lib/...')` and `require('express/package.json')` working, and other paths inside the package can no longer be required.

## Tests that guard the drop-in promise

- **Differential harness.** Thousands of scenarios (143 written by hand and 3,306 generated from every `res` method and `req` property) run on Express 5.3.0 and on the fork, and must give byte-identical responses and error logs. The method comes from [ultimate-express](https://github.com/dimdenGD/ultimate-express)'s test runner.
- **Ecosystem check.** Ten popular middleware packages (body-parser, cors, helmet, morgan, cookie-parser, express-session, compression, multer, passport, express-rate-limit) run on both and must give byte-identical responses and log lines.
- **Middleware's own test suites.** The test suites of cors, express-session, multer, express-rate-limit, http-proxy-middleware, express-openapi-validator, express-fileupload, express-basic-auth, hpp and express-mongo-sanitize (1,678 tests) run against Express 5.3.0 and against the fork. Every test that passes on 5.3.0 must pass on the fork, and today all of them do.
- **Security test suite.** Checks that an auth guard always runs before the route it protects however the path is spelled, that CR and LF never inject a header, where redirects point, that no request pollutes `Object.prototype`, and that file serving never leaves its root.
- **100% coverage.** Statements, branches, functions and lines of `lib/` are measured with c8 and must stay at 100%, or CI fails.
- **Regression tests for 19 confirmed bugs.** Each one asserts the correct behaviour and stays skipped until its fix lands.
- **Upstream test PRs.** Eight upstream test-coverage pull requests are ported, keeping their authors.

## Tooling

- **Biome** is the only linter and formatter (no ESLint, no Prettier).
- **A benchmark on every PR** that changes code, against Express 5.3.0, Fastify, Koa, Hono, polka and plain `node:http`. See [Benchmarks](./benchmarks).
- **Fewer installed packages** for development: c8 replaces `nyc` (137 packages), and Biome replaces ESLint (63 packages).

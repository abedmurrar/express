---
title: Compatibility promise
description: The fork is a drop-in replacement for Express 5.3.0 on Node.js 22, 24 and 26, and community middleware keeps working. How that is checked.
---

# Compatibility promise

## The promise

- **Drop-in for Express 5.3.0.** On Node.js 22, 24 and 26, an app that runs on Express 5.3.0 runs on the fork's `master` branch unchanged, with the same responses byte for byte. The only exceptions are bug fixes, each listed in [History.md](https://github.com/abedmurrar/express/blob/master/History.md). Deprecation warnings may be added.
- **Community middleware keeps working.** `req` and `res` stay Node's `IncomingMessage` and `ServerResponse` with the Express helpers on them. The `(req, res, next)` and `(err, req, res, next)` signatures stay, `app.use`, `Router` and sub-app mounting behave the same, and the package still loads with `require('express')` and exposes the same properties.
- **Breaking changes go elsewhere.** They go to the separate `6.x` line, never to `master`. Even there, a change that breaks community middleware is dropped or made opt-in.

## How it's checked

Every pull request has to pass all of these before it merges:

| Check | What it does |
|---|---|
| Differential harness | Sends the same requests to Express 5.3.0 (installed from npm) and to the fork: 799 hand-written scenarios and 3,306 generated ones covering every `res` method and `req` property, combined with app settings, HTTP methods, paths and headers. Responses and error logs must be byte-identical, apart from differences listed on purpose. |
| Ecosystem check | Runs body-parser, cors, helmet, morgan, cookie-parser, express-session, compression, multer, passport and express-rate-limit on both, including multi-request flows such as sessions, and requires byte-identical responses and log lines. |
| Middleware test suites | Runs the own test suites of cors, express-session, multer, express-rate-limit, http-proxy-middleware, express-openapi-validator, express-fileupload, express-basic-auth, hpp and express-mongo-sanitize (1,678 tests) against both. Every test that passes on 5.3.0 must pass on the fork. |
| Security suite | Checks auth guards against path tricks, header injection, redirect targets, prototype pollution and path traversal. |
| Robustness suite | Talks to a real server over raw sockets: clients that leave in the middle of a body or a response or before the handler runs (no crash, no file or socket left open, `req.signal` aborted), bodies sent one byte at a time, a slow reader of a large file (the server must hold back, not buffer the file), pipelined requests answered in order, nothing carried over between requests on a keep-alive connection, bodies at and over the parser limits, ranges of a large file, and 500 requests at once. |
| Memory check | Sends batches of requests for each benchmark scenario and checks that the heap, after a full garbage collection, does not grow from one batch to the next. It also checks that it fails when every request is kept on purpose. |
| Coverage gate | 100% of statements, branches, functions and lines of `lib/`. |
| Test matrix | The full test suite on Node.js 22, 24 and 26, on Linux and Windows. |

Bug fixes are the one intended difference. Each fix comes with a regression test that fails before the change and passes after, and is listed in the changelog.

## If something breaks

If your app or a middleware package behaves differently on the fork than on Express 5.3.0, that's a bug in the fork. Please [open an issue](https://github.com/abedmurrar/express/issues) with a small example.

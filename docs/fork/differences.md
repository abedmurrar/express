---
title: Differences from Express 5.3.0
description: Everything abedmurrar/express has changed compared with Express 5.3.0, as listed in its changelog.
---

# Differences from Express 5.3.0

So far the fork changes **how Express is tested and built**, not how it behaves: an app gets the same responses as on Express 5.3.0. Bug fixes, speed-ups and strict TypeScript come next, on the same drop-in line (see the [roadmap](./roadmap)).

The full list is the "Unreleased (fork)" section of [History.md](https://github.com/abedmurrar/express/blob/master/History.md).

## Runtime

- **Node.js 22, 24 and 26 only.** `engines` is `>= 22`. Express 5.3.0 supports Node.js 18 and later. CI runs the three supported versions on Linux and Windows.
- **Our own copies of `router` and `send`.** `router` 2.2.0 and `send` 1.2.1 are vendored into `lib/router` and `lib/send`, with their licences and test suites, so routing and file-sending bugs can be fixed in the fork. They're the same versions Express 5.3.0 installs, so nothing changes. See [VENDORED.md](https://github.com/abedmurrar/express/blob/master/VENDORED.md).
- **Fewer dependencies.** The `merge-descriptors`, `once` and `wrappy` packages are gone, replaced by short built-in equivalents with the same behaviour.
- **Project links** in `package.json` point to the fork, and upstream's `funding` entry is removed.

## Tests that guard the drop-in promise

- **Differential harness.** Thousands of scenarios (143 written by hand and 3,306 generated from every `res` method and `req` property) run on Express 5.3.0 and on the fork, and must give byte-identical responses and error logs. The method comes from [ultimate-express](https://github.com/dimdenGD/ultimate-express)'s test runner.
- **Ecosystem check.** Ten popular middleware packages (body-parser, cors, helmet, morgan, cookie-parser, express-session, compression, multer, passport, express-rate-limit) run on both and must give byte-identical responses and log lines.
- **Middleware's own test suites.** The test suites of cors, express-session, multer and express-rate-limit (625 tests) run against Express 5.3.0 and against the fork. Every test that passes on 5.3.0 must pass on the fork, and today all 625 do.
- **Security test suite.** Checks that an auth guard always runs before the route it protects however the path is spelled, that CR and LF never inject a header, where redirects point, that no request pollutes `Object.prototype`, and that file serving never leaves its root.
- **100% coverage.** Statements, branches, functions and lines of `lib/` are measured with c8 and must stay at 100%, or CI fails.
- **Regression tests for 19 confirmed bugs.** Each one asserts the correct behaviour and stays skipped until its fix lands.
- **Upstream test PRs.** Eight upstream test-coverage pull requests are ported, keeping their authors.

## Tooling

- **Biome** is the only linter and formatter (no ESLint, no Prettier).
- **A benchmark on every PR** that changes code, against Express 5.3.0, Fastify, Koa, Hono, polka and plain `node:http`. See [Benchmarks](./benchmarks).
- **Fewer installed packages** for development: c8 replaces `nyc` (137 packages), and Biome replaces ESLint (63 packages).

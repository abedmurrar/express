# Roadmap

This fork's plan for improving Express. Every open upstream issue and pull request has a decision in the [appendix](#appendix-every-open-upstream-issue-and-pull-request).

The research behind it is in [`research/`](research/README.md): [problems](research/problems.md), [the state of 6.x](research/6x-state.md), [what Fastify does better](research/fastify.md), [forks and rewrites](research/forks.md), and the [benchmark](research/bench/).

Snapshot: upstream `master` at `43fca52d` (Express 5.3.0), 2026-11-21.

## How to read this

**Two lines:**
- **`master`, the compatible line.** It is a drop-in replacement for Express 5.3.0 on Node 22, 24 and 26: same responses byte for byte, except bug fixes. Deprecation warnings are allowed. Upstream `master` gets merged in regularly.
- **`6.x`, our next major.** It holds the breaking changes, and `master` gets merged into it.

**Node versions:** both lines support Node 22, 24 and 26 only. Older versions are dropped (decided 2026-11-21). New Node majors are added as they reach LTS.

**Tooling:** Biome is the only linter and formatter (no ESLint, no Prettier).

**Module format:** never ES-module-only. Express and every fork ship CommonJS, or CommonJS plus an ESM entry that is a thin wrapper over the CommonJS build (one copy of the code, so no dual-package hazard). A dependency whose new release is ESM-only stays on its last CommonJS release, or our fork of it ships a CommonJS build. This holds on both lines, 6.x included.

**Merging:** PRs that change code merge once CI is green. PRs that only change docs or the roadmap merge without waiting for the test matrix (the same rule as the objection fork).

**Status:** `[ ]` to do, `[~]` in progress, `[x]` done (link the PR), `won't do` (with the reason).

**Proof rule:** an item is done only with proof, and the type depends on the item:
- a bug fix needs a regression test that fails before the change and passes after;
- a compatible-line change needs a clean run of the differential harness against Express 5.3.0;
- a performance change needs before and after numbers from `benchmarks/compare`.

**Middleware compatibility comes first, on both lines:** community middleware written for Express keeps working unchanged. `req` and `res` stay Node's `IncomingMessage` and `ServerResponse` with the Express helpers on them, the `(req, res, next)` and `(err, req, res, next)` signatures stay, `app.use`, `Router` and sub-app mounting behave the same, and the published package still loads with `require('express')` and exposes the same properties. The ecosystem suite (Tests section) runs on every PR. Any change that fails it is dropped or made opt-in, including the breaking changes in our 6.0.

**TypeScript:** the fork is written in strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, no `any`), using only syntax that Node 24 can run directly. The sources live in `src/` and `tsc` compiles them into `lib/`. The tests, the differential and middleware checks and the benchmarks all run against `lib/`, which is exactly what's published, as in the objection fork. Node won't run `.ts` files from `node_modules`, so testing the build is testing the real artifact. Types ship as `.d.ts`. Users no longer need `@types/express`.

**Definition of done for every PR:**
1. New tests for the change, plus a regression test that fails before and passes after for any bug.
2. `npm test`, the strict type check and lint all pass.
3. The differential harness shows no difference from Express 5.3.0, except the ones listed on purpose.
4. Coverage doesn't drop, and the mutation score doesn't drop (once those exist).
5. The ecosystem suite passes: the community middleware listed in the Tests section runs its own tests against the fork.
6. One full benchmark run per PR that changes code apps run, comparing the original Express 5.3.0 from npm, the base branch, the branch head, Fastify, Koa, Hono, polka and plain `node:http`. It runs in CI (the `benchmark` workflow, which writes the table to the run summary and keeps the results as an artifact), so the laptop doesn't need to be idle; commit the results file under `benchmarks/results/`. Not per edit.
7. `History.md` and this roadmap are updated in the same PR.

**Credit:** a cherry-picked upstream PR keeps its original author. Ported ideas name their source in the commit message and in `History.md`.

**Commits:** only the GitHub noreply email, and no `Co-Authored-By` lines. The versioned hooks in `.githooks/` enforce this and lint staged files; enable them once per clone with `git config core.hooksPath .githooks`. When an upstream PR is ported by hand instead of cherry-picked, its author is credited by name in the commit message.

## Order of work

1. **Foundation:** vendoring, the differential harness, the benchmark harness.
2. **Tests:** the safety net comes before the riskiest change.
3. **TypeScript and dependencies:** converting every file, proven by the tests and the harness. The dependency forks (below) are converted in the same way, starting with the ones Express calls most.
4. **Bug fixes**, then **performance**, then **additions**, on the compatible line.
5. **Our 6.0**, then **HTTP/2**.

Docs ride along with each item.

## Foundation

| Status | Item | Upstream | Line | Size | Proof | PR |
|---|---|---|---|---|---|---|
| [x] | Git identity and the commit-msg hook | | both | Small | hook rejects a test trailer | |
| [x] | Commit the research and this roadmap; ignore `research/raw` and `node_modules` | | master | Small | `git status` clean; appendix covers all 114 issues and 149 PRs | [#3](https://github.com/abedmurrar/express/pull/3) |
| [x] | Differential harness against Express 5.3.0, from the ultimate-express test runner idea | | master | Medium | 143 scenarios, 0 diffs on `master`; a one-character `res.json` change fails 47 | [#2](https://github.com/abedmurrar/express/pull/2) |
| [x] | Benchmark harness in `benchmarks/compare`, with an `--against <ref>` option and more scenarios | | master | Small | compares Express 5.3.0, the base ref, the head, Fastify, Koa, Hono, polka and `node:http` across 7 scenarios, after checking each server returns the same answer; strict TypeScript | [#4](https://github.com/abedmurrar/express/pull/4) |
| [x] | Turn the 26 repros into skipped regression tests | | master | Small | 19 bug tests fail with `REGRESSIONS_ALL=1`; 6 tests pin kept behaviour | [#6](https://github.com/abedmurrar/express/pull/6) |
| [x] | Vendor `router` 2.2.0 into `lib/router` | | master | Medium | router's own tests pass in our suite; every repro unchanged | [#1](https://github.com/abedmurrar/express/pull/1) |
| [x] | Vendor `send` 1.2.1 into `lib/send` | | master | Medium | send's own tests pass in our suite | [#1](https://github.com/abedmurrar/express/pull/1) |
| [x] | `VENDORED.md` with versions and changed commits | | master | Small | | [#1](https://github.com/abedmurrar/express/pull/1) |
| [x] | Run the benchmark in CI on every PR that changes code apps run, and work out the CPU split from the machine's topology | | master | Small | the workflow runs on this PR; the CPU split works on this laptop (8 threads) and on 4-vCPU runners | [#15](https://github.com/abedmurrar/express/pull/15) |
| [x] | Support Node 22, 24 and 26 only: `engines` `>= 22`, CI matrix 22, 24 and 26 on Linux and Windows, remove the legacy (Node 16 and 17) workflow, and README and docs updated | PR #7552, discussions#236 | both | Small | CI runs on 22, 24 and 26 only; npm warns when installing on older Node | [#12](https://github.com/abedmurrar/express/pull/12) |
| [x] | Biome replaces ESLint: lint rules mapped one to one (unused variables except rest siblings and caught errors, `==` only against `null`, no global `Buffer`), the pre-commit hook runs `biome check` on staged files, and `eslint`, `globals` and `eslint.config.js` are removed. No Prettier | PRs #6118, #6480, #6912 | master | Small | the same three lint findings as ESLint at the same positions on the file with every violation, and the formatter flags the indentation, trailing-space and final-newline cases; 0 findings on the repo | [#13](https://github.com/abedmurrar/express/pull/13) |
| [x] | Format the whole repo with Biome's formatter in one PR, right before the TypeScript conversion, so later diffs stay readable | | master | Medium | done together with the switch, because Biome checks indentation, trailing spaces and final newlines only through its formatter. Same 2,326 tests, 100% coverage, and the differential harness unchanged; the commit is in `.git-blame-ignore-revs` | [#13](https://github.com/abedmurrar/express/pull/13) |
| [ ] | Re-sync the vendored router to 2.3.0 once it is 7 days old (from 2026-11-24) | #4059, router#206, router#174, router#196 | master | Small | router tests, harness, repro 4059 | |
| [x] | Update mocha and supertest | #7547, PR #7600 | master | Small | the same tests as master run and pass (2,273 passing, 19 skipped regression tests); mocha 11.8.0 here, mocha 12 (Node 20.19+) on 6.x | [#7](https://github.com/abedmurrar/express/pull/7) |
| [x] | Port upstream test-coverage PRs | PRs #6703, #6892, #6893, #7038, #7050, #7339, #7423, #7546, #7572 | master | Small | 8 ported with their authors (35 more tests, all passing); #6703's tests were already on master | [#8](https://github.com/abedmurrar/express/pull/8) |
| [x] | ESLint 9 and a pre-commit lint hook | PRs #6118, #6480, #6912 | master | Small | ESLint 10 flat config gives the same findings as the old setup on a file with every rule's violation, and 0 on the repo; git's own hooks (`.githooks/`), no extra package | [#9](https://github.com/abedmurrar/express/pull/9) |

## Forks of the dependencies

Every package Express depends on that does real work gets its own fork under `abedmurrar/<repo>`, held to the same rules as this repo (CommonJS, or CommonJS plus a thin ESM wrapper; never ESM-only): middleware compatibility, strict TypeScript, tests, the differential harness against its upstream release, and a benchmark run per PR. Each fork keeps its upstream history and licence, and syncs from upstream the same way this repo does.

Express uses the forks as vendored copies (as with `router` and `send` today), synced from each fork, until publishing is approved. After that it uses them as `@abedmurrar/*` packages.

Of the 64 packages Express installs today, 33 are forked (below), 30 are shims and one-liners that Node 24 provides itself, which are removed inside the forks instead, and 1 (`ms`) stays as an ordinary dependency, because Node has no built-in for parsing time strings like `'1d'`.

| Status | Fork | Upstream | Plan |
|---|---|---|---|
| [ ] | `router` | pillarjs/router | Fork; becomes the source of `lib/router` |
| [ ] | `send` | pillarjs/send | Fork; becomes the source of `lib/send` |
| [ ] | `path-to-regexp` | pillarjs/path-to-regexp | Fork |
| [ ] | `finalhandler` | pillarjs/finalhandler | Fork |
| [ ] | `encodeurl` | pillarjs/encodeurl | Fork |
| [ ] | `parseurl` | pillarjs/parseurl | Fork |
| [ ] | `iconv-lite` | pillarjs/iconv-lite | Fork; drop `safer-buffer` (Node's `Buffer` is safe) |
| [~] | `body-parser` | expressjs/body-parser | Fork. 2.4.0 (`b4744d7`) is vendored into `src/body-parser` with `require('../../../qs')`, so `express.urlencoded({ extended: true })` uses our `qs` and the npm `qs` chain drops out (20 fewer production packages, 58 to 38). Its 277 tests pass on the copy, and 57 new body differential scenarios match 5.3.0 ([#58](https://github.com/abedmurrar/express/pull/58)). Still to do: fork the repository so it becomes the source of `lib/body-parser` |
| [~] | `serve-static` | expressjs/serve-static | Fork; uses our `send`. Forked to https://github.com/abedmurrar/serve-static (no code pushed yet), and 2.2.1 (`76312e1`) is vendored into `src/serve-static` with `require('../send')`, so `express.static` uses our `send`: serve-static's 92 tests pass on the copy, and 24 `express.static` differential scenarios match 5.3.0 ([#54](https://github.com/abedmurrar/express/pull/54)). Still to do: push our copy to the fork so it becomes the source of `lib/serve-static` |
| [ ] | `express-generator` | expressjs/generator | Fork; generates TypeScript apps and points at our package and docs |
| [ ] | `accepts` | jshttp/accepts | Fork |
| [ ] | `content-disposition` | jshttp/content-disposition | Fork |
| [ ] | `content-type` | jshttp/content-type | Fork |
| [ ] | `cookie` | jshttp/cookie | Fork |
| [ ] | `etag` | jshttp/etag | Fork |
| [ ] | `forwarded` | jshttp/forwarded | Fork |
| [ ] | `fresh` | jshttp/fresh | Fork |
| [ ] | `http-errors` | jshttp/http-errors | Fork; drop `inherits`, `setprototypeof`, `toidentifier`, `depd` (built-in classes and `util.deprecate`) |
| [ ] | `media-typer` | jshttp/media-typer | Fork |
| [ ] | `mime-db` | jshttp/mime-db | Fork |
| [ ] | `mime-types` | jshttp/mime-types | Fork |
| [ ] | `negotiator` | jshttp/negotiator | Fork |
| [ ] | `on-finished` | jshttp/on-finished | Fork; drop `ee-first` |
| [ ] | `proxy-addr` | jshttp/proxy-addr | Fork |
| [ ] | `range-parser` | jshttp/range-parser | Fork |
| [ ] | `statuses` | jshttp/statuses | Fork |
| [ ] | `type-is` | jshttp/type-is | Fork |
| [ ] | `vary` | jshttp/vary | Fork |
| [ ] | `raw-body` | stream-utils/raw-body | Fork; drop `unpipe` |
| [ ] | `bytes` | visionmedia/bytes.js | Fork |
| [ ] | `cookie-signature` | visionmedia/node-cookie-signature | Fork |
| [ ] | `escape-html` | component/escape-html | Fork |
| [ ] | `ipaddr.js` | whitequark/ipaddr.js | Fork |
| [~] | `qs` | ljharb/qs | Vendored 6.17.1 into `src/qs` ([#57](https://github.com/abedmurrar/express/pull/57)): the `side-channel` chain is replaced by `WeakMap` (and `Map` for `stringify`'s cycle detection) and `es-define-property` by `Object.defineProperty`. With body-parser vendored too ([#58](https://github.com/abedmurrar/express/pull/58)), `qs` and the 18 packages under it are gone from the production install |
| [ ] | Docs site | expressjs/expressjs.com | Fork; see Docs and identity |

Removed rather than forked, using what Node 24 has: `debug` (`util.debuglog`), `depd` (`util.deprecate`), `once`, `wrappy`, `inherits`, `setprototypeof`, `toidentifier`, `merge-descriptors`, `ee-first`, `unpipe`, `safer-buffer`, `is-promise`, `function-bind`, and the `qs` chain (`side-channel`, `side-channel-list`, `side-channel-map`, `side-channel-weakmap`, `get-intrinsic`, `call-bind-apply-helpers`, `call-bound`, `es-define-property`, `es-errors`, `es-object-atoms`, `get-proto`, `dunder-proto`, `gopd`, `has-symbols`, `hasown`, `math-intrinsics`, `object-inspect`). Each removal that could change behaviour on the compatible line is checked by the differential harness. `debug` and `depd` change warning and debug output, so their removal stays on 6.x (Dependencies section).

Later, decided package by package: forks of the Express-family middleware (`cors`, `morgan`, `cookie-parser`, `express-session`, `multer`, `compression`, `method-override`, `serve-favicon`, `response-time`, `vhost`), held to the same rules.

## Docs and identity

The fork must never look like the official Express project. It keeps credit to Express and its authors everywhere.

| Status | Item | Line | Proof | PR |
|---|---|---|---|---|
| [x] | README for the fork: what it is, how it differs from Express 5.3.0 (link to this roadmap), install, credit to Express and its contributors, no Express logo | says what the fork is and isn't, the drop-in promise, how to install from GitHub, development commands and credit; no Express logo | [#16](https://github.com/abedmurrar/express/pull/16) |
| [x] | Docs website: start from the expressjs.com content (with its licence and credit), built with VitePress like the objection fork, marked clearly as the fork's docs, with the fork's additions in their own tab; deployed to GitHub Pages by a docs workflow on pushes to `master` | master | `docs/` builds with VitePress (27 English 5.x pages from expressjs.com under CC BY 4.0, credited in the footer and `docs/LICENSE.md`; a Fork tab; a notice on every page). The `docs` workflow builds it on PRs and deploys it on pushes to `master`. The first deploy needs GitHub Pages turned on in the repository settings, with the source "GitHub Actions" | |
| [~] | Docs content: our changes, new APIs, TypeScript usage, the middleware-compatibility promise, and a "differences from Express 5.3.0" page | master | Done: the differences from Express 5.3.0, the compatibility promise and how it's checked, benchmarks, a roadmap summary and install steps, in the Fork tab. Still to do: new APIs and TypeScript usage, once they exist | |
| [~] | Update every project URL to the fork: `package.json` (`homepage`, `repository`, `bugs`; remove upstream's `funding`), README links and badges (CI, scorecard), the clone instructions, the security policy, links in code comments and error messages, and the generator templates. Links that cite upstream issues, PRs and history stay pointing upstream | master | `package.json` (homepage, repository, bugs; upstream `funding` removed), README links and badges, the clone instructions and the security policy are done. Still to do: links in code comments and error messages, the generator templates, and the CI URL check | [#16](https://github.com/abedmurrar/express/pull/16) |
| [x] | Our own security policy (`SECURITY.md`) for reports about the fork | private vulnerability reporting is turned on for the repository | [#16](https://github.com/abedmurrar/express/pull/16) |

## Tests

The goal is that nothing slips: every behaviour Express has is pinned by a test, and the tests themselves are proven to catch changes.

| Status | Item | Upstream | Line | Size | Proof | PR |
|---|---|---|---|---|---|---|
| [x] | Coverage measured with V8 coverage (`c8`), enforced at 100% lines and branches for `lib/` | | master | Medium | 100% statements, branches, functions and lines; `test-ci` exits 1 when the new tests are removed. Two commented `c8 ignore` lines: the never-called `Router.prototype` function and a race guard in `sendFile` | [#10](https://github.com/abedmurrar/express/pull/10) |
| [ ] | Reach 100% under the stricter branch counting of `@vitest/coverage-v8` (it counts each side of `&&`, `\|\|` and `??` as a branch); today it reads 79.8% of branches on the same tests where c8 reads 100% | | master | Large | the coverage gate switches provider and stays at 100% | |
| [ ] | Mutation testing (Stryker) on `lib/`, with a minimum score; every surviving mutant gets a test or a written reason | | master | Large | mutation report committed | |
| [x] | Grow the differential harness to 1,000+ scenarios, generated from every `res`/`req` method, argument type, setting, HTTP method and header combination | | master | Large | 3,306 generated scenarios (all-pairs over 20 `res` methods and 47 `req` reads, with 9 app settings, 5 HTTP methods, 9 paths and 12 request headers), 0 diffs, about 6 seconds. On a broken build, a changed `res.send` charset fails 1,037 of them, a no-op `res.vary` fails 306, and keeping the whole `X-Forwarded-Proto` list fails 2 (the 143 hand-written scenarios: 56, 10 and 1). Two commented normalisations: no stack frames in error pages and logs, and `Expires` on `maxAge` cookies | [#20](https://github.com/abedmurrar/express/pull/20) |
| [x] | Property-based tests (fast-check) for query parsing, path matching, content negotiation, cookies, ranges, ETag and freshness | | master | Large | 38 properties hold for 10,000 runs each (with the fixed seed and with seed 7), and 9 deliberate one-line breaks across the areas each make them fail. They found one bug that Express 5.3.0 has too (a `#` fragment changes the routed path), now a skipped regression test | [#26](https://github.com/abedmurrar/express/pull/26) |
| [x] | Differential fuzzing against Express 5.3.0: random route tables and paths, random query strings, random Host and X-Forwarded headers | | master | Medium | runs in CI with a fixed seed (300 random apps); 10,000 apps with each of two seeds show 0 differences, and deliberate breaks in routing, `req.hostname` and `X-Forwarded-Host` handling are caught; `FUZZ_RUNS` and `FUZZ_SEED` set a longer run. The nightly job is not added yet | [#26](https://github.com/abedmurrar/express/pull/26) |
| [x] | Security suite: authorization-bypass cases (case, trailing slash, encoded paths, path arrays, stateful regex), header injection, response splitting, open redirects, prototype pollution, path traversal in `sendFile` and static | | master | Large | 1,125 tests in `test/security/` (18 of them skipped bug tests for 3 bug-fix rows). Each group fails on a deliberately broken build, one guard at a time: a router fast path that skips middleware (49 failures), case-sensitive middleware (31), routes matching decoded paths (82), header writes that skip Node's checks (15), unencoded `res.location` (4 and 27), no backslash handling in redirects (12), a naive query parser (9) or JSON merge (5), and no `..` check in either `send` (46 and 45) | [#23](https://github.com/abedmurrar/express/pull/23) |
| [ ] | Robustness: client aborts, slow clients, pipelining, keep-alive reuse, large bodies, many concurrent requests | | master | Medium | new tests | |
| [ ] | Memory-leak check: heap stays flat over a long request run for each scenario | | master | Small | heap snapshot comparison | |
| [~] | Ecosystem suite: run the own test suites of the 25 most-downloaded Express middleware against the fork, on both lines (body-parser, cors, helmet, morgan, cookie-parser, express-session, compression, multer, passport, express-rate-limit, express-validator, http-proxy-middleware, serve-favicon, method-override, connect-redis, express-fileupload, swagger-ui-express and others) | | both | Large | first 10 packages (11 scenarios incl. session, upload, auth, rate limiting) give byte-identical responses and morgan log lines on Express 5.3.0 and the fork (#14). The own suites of cors, express-session, multer, express-rate-limit, http-proxy-middleware, express-openapi-validator, express-fileupload, express-basic-auth, hpp and express-mongo-sanitize (1,678 tests that pass on 5.3.0) pass on the fork exactly as on 5.3.0, in a CI workflow (#18 and this PR). Most of the 25 most-downloaded middleware can't be added: the expressjs/* packages (serve-static, body-parser, compression, morgan, cookie-parser, errorhandler, serve-favicon, method-override, response-time, connect-timeout, vhost, csurf) and helmet, passport, express-validator, express-winston, express-jwt and connect-flash test with plain `http`, connect or mock objects, not Express; connect-redis needs Redis. Still to do: swagger-ui-express (tests drive headless Chrome), then other popular packages whose suites use Express | [#14](https://github.com/abedmurrar/express/pull/14), [#18](https://github.com/abedmurrar/express/pull/18) |
| [ ] | Type tests for the whole public API, including route-parameter types from path strings | | master | Medium | type tests in CI | |
| [x] | Instruction-count benchmark gate on every PR, as in the objection fork: count CPU instructions with valgrind (cachegrind, pinned and checksum-verified) under deterministic-GC Node flags, against the merge-base, and fail when any scenario is more than 1% worse | | master | Medium | `benchmarks/count/` and the `instruction count` workflow. Same-tree spread at the CI settings: 0.05% to 0.12% across the 7 scenarios (hello 0.09%, json 0.07%, params 0.07%, mw10 0.12%, routes100 0.05%, post-json 0.12%, not-found 0.09%), after a fixed 30,000-request warm-up, `--predictable` and a 1e9-instruction window (it was 0.8% before). A 1,000-step loop in `res.send` fails the gate with +8.9% to +13.9% on the 6 scenarios that call it, and not-found stays at -0.05%. CI runs it report-only for now (`--report-only`, one line to remove) | |
| [ ] | Node version matrix for the published JavaScript (22, 24, 26, Linux and Windows) | | master | Small | CI matrix | |
| [x] | Move the test suite from mocha to Vitest (decided 2026-11-21): one PR, every test kept (the same count before and after, including the skipped regression tests), `done` callbacks turned into awaited requests, mocha removed. `@vitest/coverage-v8` keeps the 100% gate and the two commented `c8 ignore` lines | | master | Large | the same 6,767 unique test titles with the same statuses under mocha and Vitest (6,752 passing, 37 skipped); 100% coverage kept with c8 around Vitest (threads); a deliberate global leak fails the file. Full run about 14 s against mocha's 9–11 s, for per-file isolation | [#29](https://github.com/abedmurrar/express/pull/29) |

## TypeScript

| Status | Item | Upstream | Line | Size | Proof | PR |
|---|---|---|---|---|---|---|
| [x] | Strict TypeScript 7 setup: tests run on `.ts` with Node 24, build to JavaScript and `.d.ts` for publishing | | master | Medium | done: `src/` built by TypeScript 7.0.2 (strict options, `allowJs` while files are converted) into `lib/`, with tests on the built output at 100% coverage mapped back to `src/`, a type check in CI, and the same published file list. Public `.d.ts` files ship from `typings/` (#48) | [#30](https://github.com/abedmurrar/express/pull/30), [#48](https://github.com/abedmurrar/express/pull/48) |
| [x] | The built package keeps the CommonJS entry and export shape of Express 5.3.0 (`require('express')`, `express.Router`, `express.json` and the rest), plus an ESM entry | | master | Small | `test/exports.js` checks `require('express')` against Express 5.3.0 (own property names, types, function names and lengths, and the prototypes' keys), deep `lib/` requires, and that `import` gives every named export Node gives 5.3.0, each the CommonJS value. `index.mjs` is a thin wrapper over the CommonJS build, so there is one copy of Express. `exports` has `import` and `require` conditions with their own types, plus `./lib/*` and `./package.json`. The middleware checks and suites pass unchanged |  [#48](https://github.com/abedmurrar/express/pull/48) |
| [x] | Convert `lib/` to TypeScript, one file per PR (`utils`, `view`, `request`, `response`, `application`, `express`) | | master | Large | all six done: `utils` (#31), `view` and `request` (#32), `response` (#33), `application` and `express` (#43). Strict, no `any`, the same exported names (and for `request`, `response` and `application`, the same prototype objects with the same properties in the same order), 100% coverage, the differential and middleware checks unchanged. The local request, response and app interfaces are replaced by the shared `Request`, `ExpressResponse` and `Application` types, which the router's request and response types now alias. `index.js` stays JavaScript (the package entry, outside `src/`) | [#31](https://github.com/abedmurrar/express/pull/31), [#32](https://github.com/abedmurrar/express/pull/32), [#33](https://github.com/abedmurrar/express/pull/33), [#43](https://github.com/abedmurrar/express/pull/43) |
| [x] | Convert the vendored router and send to TypeScript | | master | Large | their suites and the harness pass. Router done (#36), `send` done (#44): strict, no `any`, the same export shape, prototype chain, function names and lengths, 100% coverage | [#36](https://github.com/abedmurrar/express/pull/36), [#44](https://github.com/abedmurrar/express/pull/44) |
| [x] | Public types in our source, ported from `@types/express` and `@types/express-serve-static-core` (MIT, credited), so `@types/express` users can switch without changes | #2818, #6370, #6385, #7231 | master | Large | hand-written in `typings/`, ported from `@types/express` 5.0.6 and `@types/express-serve-static-core` 5.1.3 with their licence header and authors, and no type dependencies besides `@types/node`. The type tests pass, and express-openapi-validator, express-rate-limit and http-proxy-middleware (on TypeScript 5.8, 5.9 and 6.0) give the same compiler output against them as against `@types/express`. the `req.body`, `next()` and `res.send` signatures that #6370 and #6385 question are unchanged from `@types`, so existing code keeps compiling |  [#48](https://github.com/abedmurrar/express/pull/48) |
| [ ] | Typed route parameters from path strings, typed `req.body`/`req.query` through generics, and typed `res.locals` | | master | Medium | type tests | |
| [x] | Type tests run with `tsc` (strict and loose configs, plus expected-error tests), `attw --pack` to check the published types and exports, and a type-size budget; `@types/node` pinned to Node 22 so the compiler rejects newer Node APIs | | master | Medium | `npm run test:types` (strict and loose configs, expected-error tests, and `compat/` snippets also compiled against `@types/express`) and `npm run attw` (no problems for node10, node16 CJS and ESM, and bundler) run in the `Public types` CI job; the declarations stay under a 75,000-byte budget (62,551 bytes now); `@types/node` is `^22` (since #30) |  [#48](https://github.com/abedmurrar/express/pull/48) |
| [ ] | Drift check between the public types in `typings/` and the implementation in `src/`: every public method and option exists in `src` with a compatible type (for example `res.sendFile` options against send's `SendOptions`) | | master | Medium | the check runs in CI and fails on a planted mismatch | |
| [ ] | Type tests on TypeScript 5.x as well as 7 (its own install folder, so `node_modules/.bin/tsc` stays 7) | | master | Small | the job runs in CI | |
| [ ] | Convert the test suite to TypeScript | | master | Large | same test count, all passing | |

## Dependencies

Each dependency is moved to its latest release once it is outside the 7-day npm release-age window, or replaced, or vendored. Any change in behaviour found by the harness sends that upgrade to 6.x.

**ES-module-only releases stay off the compatible line.** Jest (and other CommonJS module loaders) can't `require()` an ES module, so an ESM-only dependency makes Express fail to load under Jest. The middleware suites check found this when content-type 3, encodeurl 3 and content-disposition 3 were tried (closed PR #21): 206 of express-rate-limit's 245 tests stopped passing. These packages stay on their last CommonJS release until our forks of them ship CommonJS builds (Forks section), or until 6.x.

| Status | Package | Now | Latest (published) | Plan | Line |
|---|---|---|---|---|---|
| [ ] | `accepts` | ^2.0.0 | 2.0.0 | Keep | master |
| [~] | `body-parser` | vendored 2.4.0 | 2.4.0 (2026-10-22) | Vendored ([#58](https://github.com/abedmurrar/express/pull/58)) on our `qs`; its `bytes`, `iconv-lite` and `raw-body` became Express dependencies. The JSON `__proto__` check stays on 6.x | master |
| [ ] | `bytes` | ^3.1.2 | 3.1.2 | Keep (body-parser's `limit` parser) | master |
| [ ] | `content-disposition` | ^2.0.1 | 3.1.0 (2026-11-18, inside the window until 2026-11-25) | Stays on 2.x: 3.x is ESM-only and breaks Jest users (#21). Our fork ships a CommonJS build (never ESM-only, on either line) | master |
| [ ] | `content-type` | ^2.0.0 | 3.1.1 (2026-09-17) | Stays on 2.x: 3.x is ESM-only and breaks Jest users (#21). Our fork ships a CommonJS build (never ESM-only, on either line) | master |
| [ ] | `cookie` | ^0.7.1 | 2.0.2 (2026-11-05) | Update on 6.x (supersedes the `cookie@1` item); serialisation changes | 6.x |
| [ ] | `cookie-signature` | ^1.2.1 | 1.2.2 | Update | master |
| [ ] | `debug` | ^4.4.0 | 4.4.3 | Replace with `util.debuglog` (the `DEBUG=express:*` switch changes, so 6.x) | 6.x |
| [ ] | `depd` | ^2.0.0 | 2.0.0 | Replace with `util.deprecate` | 6.x |
| [ ] | `encodeurl` | ^2.0.0 | 3.0.1 (2026-11-12) | Stays on 2.x: 3.x is ESM-only and breaks Jest users (#21). Our fork ships a CommonJS build (never ESM-only, on either line) | master |
| [ ] | `escape-html` | ^1.0.3 | 1.0.3 | Keep (Node has no built-in) | master |
| [ ] | `etag` | ^1.8.1 | 2.0.0 (2026-11-21, inside the window until 2026-11-28) | Update after the window, harness-checked | master |
| [ ] | `finalhandler` | ^2.1.0 | 2.1.1 | Update now; vendor on 6.x for the 4xx logging change | both |
| [ ] | `fresh` | ^2.0.0 | 2.0.0 | Keep | master |
| [ ] | `http-errors` | ^2.0.0 | 2.0.1 | Update | master |
| [ ] | `iconv-lite` | ^0.7.3 | 0.7.3 | Keep (body-parser's charset decoding; was a dev dependency); fork to drop `safer-buffer` (Forks section) | master |
| [x] | `merge-descriptors` | ^2.0.0 | 2.0.0 | Dropped (#24): a three-line `mixin` with `Object.getOwnPropertyNames` and `Object.defineProperty`, same semantics (skips names the app already has) | master |
| [ ] | `mime-types` | ^3.0.0 | 3.0.2 | Update | master |
| [ ] | `on-finished` | ^2.4.1 | 2.4.2 | Update | master |
| [x] | `once` | ^1.4.0 | 1.4.0 | Dropped (#24): a small local `once` in `app.listen`; this also removes `wrappy` | master |
| [ ] | `parseurl` | ^1.3.3 | 1.3.3 | Keep (WHATWG `URL` parses differently) | master |
| [ ] | `proxy-addr` | ^2.0.8 | 2.0.8 | Keep | master |
| [x] | `qs` | vendored 6.17.1 | 6.17.1 | Vendored ([#57](https://github.com/abedmurrar/express/pull/57)), with no dependencies. With body-parser vendored on it ([#58](https://github.com/abedmurrar/express/pull/58)), the npm `qs` and its 18 packages are no longer installed in production | master |
| [ ] | `range-parser` | ^1.2.1 | 2.0.0 (2026-11-18, inside the window until 2026-11-25) | Update after the window, harness-checked | master |
| [ ] | `raw-body` | ^3.0.2 | 4.0.0 (2026-07-12) | Stays on 3.x, the range body-parser 2.4.0 uses; 4.0.0 not yet checked, so it goes through the harness first | master |
| [ ] | `router` | vendored 2.2.0 | 2.3.0 (2026-11-17) | Re-sync after the window (Foundation row) | master |
| [ ] | `send` | vendored 1.2.1 | 1.2.1 | Vendored | master |
| [x] | `serve-static` | vendored 2.2.1 | 2.2.1 | Vendored ([#54](https://github.com/abedmurrar/express/pull/54)): `express.static` needed the `send` fixes (a throwing `setHeaders` crashed the process). The dependency is removed; 2 security tests fail with an uncaught error on the npm package and pass on the copy | master |
| [ ] | `statuses` | ^2.0.1 | 2.0.2 | Update; check whether `http.STATUS_CODES` can replace it on 6.x | both |
| [ ] | `type-is` | ^2.1.0 | 3.0.0 (2026-09-21) | Stays on 2.x: 3.x is ESM-only (breaks Jest users, #21) and changes what `req.is()` returns. Our fork, or 6.x | master |
| [ ] | `vary` | ^1.1.2 | 1.1.2 | Keep | master |
| [ ] | `is-promise` (router) | ^4.0.0 | | Drop: `instanceof Promise` (Our 6.0 row, router#137) | 6.x |
| [~] | Dev dependencies: supertest 7.3 (done, #7), ESLint 10 flat config (done, #9; replaced by Biome, #13), `c8` instead of `nyc` (done, #10), TypeScript 7, and mocha 12 on master (done, #12) | | | Update | both |

## Bug fixes on the compatible line

| Status | Item | Upstream | Line | Size | Proof | PR |
|---|---|---|---|---|---|---|
| [x] | A bad value in `res.sendFile`'s or `res.download`'s `headers` option (a CR or LF, or an invalid name) crashes the process: it throws inside `send`'s file-stat callback. Any throw from a `headers` listener now becomes an error for the callback or `next(err)`. `express.static` is covered too: it uses our vendored serve-static, so a throwing `setHeaders` (or a CR or LF set through `res.setHeader` in it) goes to the error handler | | master | Small | 6 security tests that fail with an uncaught error before the fix (4 for `res.sendFile` and `res.download`, 2 for `express.static`) | [#39](https://github.com/abedmurrar/express/pull/39), [#54](https://github.com/abedmurrar/express/pull/54) |
| [ ] | `res.send` corrupts ArrayBuffer, DataView and typed-array bodies | #7362, #7510, #7538, PRs #7574, #7363, #7511, #7542, #7410 | master | Small | repros 7362, 7510, 7538 | |
| [ ] | `res.redirect` sends Content-Length with Transfer-Encoding | #7506, PR #7508 | master | Small | repro 7506 | |
| [ ] | `res.set` sends `Content-Type: false` for unknown types | #7034, PR #7035 | master | Small | repro 7034 | |
| [ ] | `res.cookie` adds Expires despite `expires: 0` | #5150, PR #5151 | master | Small | repro 5150 | |
| [ ] | `sendFile` ignores a per-call `etag: false` | #4750, PR #7467 | master | Small | repro 7467 | |
| [x] | `/proc` files are sent empty | #4944 | master | Small | repro 4944 passes; send tests with a fixture whose `fs.stat` says size 0 (GET, a 300 KB file, HEAD, Range, 304, `start`/`end`, `res.sendFile`, `res.download`, `express.static`, open and read errors), really empty files unchanged (`Content-Length: 0`, HEAD, 416), and `/proc/version` and `/proc/self/status` where `/proc` exists; a differential scenario on Linux that differs from 5.3.0 on purpose, and the generated empty-file scenarios still match. Removing the fix fails 16 tests | [#67](https://github.com/abedmurrar/express/pull/67) |
| [ ] | `res.render` after a send crashes the process | #7560, PR #7559 | master | Small | repro 7560 | |
| [ ] | `res.render` mutates the caller's options | PR #7541 | master | Small | repro 7541 | |
| [ ] | A view name ending in `.` throws synchronously | #7350, PRs #7351, #7392 | master | Small | repro 7350 | |
| [x] | `app.listen` leaves its error listener attached | PR #7501 | master | Small | repros 7501 and 7501b are tests: no listener left after a successful start, a later error reaches the app's listener or is thrown, an `EADDRINUSE` from listening again is not caught, and a failed start leaves no listeners; a differential scenario that differs from 5.3.0 on `app.listen()` only. Removing the fix fails 6 tests | [#67](https://github.com/abedmurrar/express/pull/67) |
| [ ] | A JSONP callback that sanitises to nothing gives broken JS | PR #7161 | master | Small | repro 7161 | |
| [ ] | `req.subdomains` splits IPv6 literals | #7532, PR #7533 | master | Small | repro 7532 | |
| [ ] | Userinfo in the Host header becomes `req.hostname` | PR #7317 | master | Small | repro 7317 | |
| [ ] | Uppercase `X-Forwarded-Proto: HTTPS` is not secure | PR #7330 | master | Small | repro 7330 | |
| [ ] | A `//` mount also matches `/` | #4557, PR #7286, router#190 | master | Medium | repro 4557 | |
| [ ] | A `req.url` rewrite in a mounted router loses a slash | #4059 | master | Small | repro 4059; fixed by the router 2.3.0 re-sync | |
| [ ] | A router cycle gives a stack overflow instead of a clear error | #6809, router#183 | master | Small | repro 6809 | |
| [ ] | A `#` fragment in the request target changes the routed path | | master | Small | regression test (found by the property tests) | |
| [ ] | Mount-path edge case from #3798 | #3798, router#206 | master | Small | new test | |
| [ ] | `res.links` with empty values | PRs #7320, #7578 | master | Small | new test | |
| [ ] | Quoted `;` in `acceptParams` | PR #7479 | master | Small | new test | |
| [ ] | Async view lookup (no sync file I/O after startup) | PR #2653 | master | Medium | existing view tests | |
| [ ] | View engine extension matching ignores case | #4594, PR #7051 | master | Small | new test | |
| [ ] | `router.use(subApp)` restores req/res prototypes like `app.use` | #7427 | master | Small | new test | |
| [ ] | `req.subdomains` ignores a trailing root dot | PR #7331 | master | Small | repro needed first | |
| [ ] | `res.append` keeps an existing empty header value | PR #7332 | master | Small | repro needed first | |
| [ ] | `res.redirect` body says `undefined` for non-standard status codes | PRs #7407, #7045 | master | Small | repro needed first | |
| [x] | A RegExp path with the `g` or `y` flag matches only every other request (an auth bypass: `app.use(/^\/admin/g, auth)` was skipped on every other request) | | master | Small | the 16 security-suite tests (app.use, app.all, router.use and a route, with g, y, gi and iy) pass; router tests for params, path arrays, router.route, a lastIndex left by the app, y staying anchored; a differential scenario that differs from 5.3.0 on purpose. Removing the fix fails 27 tests | [#62](https://github.com/abedmurrar/express/pull/62) |

## Performance on the compatible line

Baseline on this machine (Node 24.17.0, requests per second): Hello World 33,776, JSON 30,503, 10 middleware 30,395, 100 routes 24,654. Fastify 5.12.8 does about 1.8x these numbers.

**Built-ins first.** We support Node 22.13 and later only, so code written for old Node versions can go, as it did in the objection fork, which dropped lodash and bluebird for what Node has built in. Node's own versions are usually faster than the old workarounds. Each change keeps the same results (the differential harness checks this) and is measured by the benchmark in its PR. This applies to our code and to every fork of a dependency below.

| Status | Item | Upstream | Line | Size | Proof | PR |
|---|---|---|---|---|---|---|
| [x] | Skip the per-request prototype swap when `app.listen()` made the server | PR #7555 | master | Small | CI benchmark against `master`: hello +11.7%, json +8.3%, params +7.7%, mw10 +9.3%, routes100 +5.2%, post-json +4.1%, not-found +11.4%; differential scenarios also run on `app.listen()` | [#38](https://github.com/abedmurrar/express/pull/38) |
| [ ] | Use Node's built-ins instead of old workarounds in our own code: rest parameters and spread instead of copying `arguments` by hand (32 places in application, request, response, view and the router), `Object.hasOwn`, and similar. Functions keep their `name` and `length` | | master | Medium | bench and harness | |
| [x] | ETags through the one-shot `crypto.hash()` instead of the `createHash().update().digest()` chain, with the same output. UTF-8 strings are hashed without first being copied into a Buffer. Identical to `etag` 1.8.1 on 40,160 random bodies and every encoding (now a property test). An in-process timing on a loaded machine shows 1.11x for an 11-byte string and 0.97x to 1.03x for 2 KB and 16 KB bodies, so the gain is small; the CI benchmark and the instruction-count tool give the real number | | master | Small | bench and harness | |
| [ ] | The same built-ins pass in every fork of a dependency, measured in each fork's own benchmark | | master | Large | each fork's bench and harness | |
| [x] | Trust-proxy cost: remember each address's trust decision for a trust list (`'loopback, 10.0.0.0/8'` and the like), in a map of at most 1,000 entries per compiled setting, instead of caching each getter per request (which only helps apps that read `req.ip` twice). proxy-addr's compiled function parses the address and matches every subnet on each call, and its result depends only on the address | PR #7519 | master | Small | property tests against proxy-addr (random IPv4, IPv6 and mapped addresses and lists, invalid lists, 3,000 distinct addresses, two apps never sharing decisions; a planted shared map fails them). With a different client per request behind a trusted proxy: `req.ip` 7,680→4,383 ns, `req.protocol` 4,712→1,458 ns (load average 11, rough) | |
| won't do | Cache the `accepts` instance per request | PR #7008 | master | Small | measured: building an `accepts` instance costs about 200 ns and a per-request cache adds about 200 ns to the first call, while `req.accepts()` itself takes about 4.4 µs, which a cached instance doesn't save (negotiator parses the header again on every call). See the negotiator row below | |
| [ ] | Remember parsed `Accept`, `Accept-Language`, `Accept-Encoding` and `Accept-Charset` headers in our negotiator fork (a capped map by header string), so `req.accepts*` and `res.format` skip re-parsing them | | master | Small | negotiator's own tests, the harness, and per-call timing | |
| [x] | Memoise content-type lookups: `mime.contentType` in `res.set` and `res.type`, and `setCharset` in `res.send`, in maps capped at 100 entries (emptied when full) | PR #7481 | master | Small | property tests against the uncached functions (and a planted cache bug fails them); per call 656→67 ns (`setCharset` json), 1,057→91 ns (html), 815→42 ns (`mime.contentType('html')`) | |
| won't do | Write the default HTML and JSON content types directly | PR #7516 | master | Small | it skips `res.type`/`res.set`, so an app or middleware that overrides them would no longer see those calls; the memoised lookups above already remove the cost | |
| won't do | Router: check the method before running the path regex | | master | Small | built in #51 and removed in #59: the instruction counts went up, not down (100 routes +12.02%, 10 middleware +4.36%, hello +1.51%, not-found +2.24%). V8 compiles the path regexes and they already fail on the first differing character, so a check in JavaScript before each regex only adds work; the method check adds lookups on every route layer and saves nothing when the routes share a method | [#51](https://github.com/abedmurrar/express/pull/51) |
| won't do | Router: a literal-prefix check before each regex, keeping the order | | master | Small | built in #51 and removed in #59: the instruction counts went up, not down (100 routes +12.02%, 10 middleware +4.36%, hello +1.51%, not-found +2.24%). V8 compiles the path regexes and they already fail on the first differing character, so a check in JavaScript before each regex only adds work; the method check adds lookups on every route layer and saves nothing when the routes share a method | [#51](https://github.com/abedmurrar/express/pull/51) |
| [x] | Extended query parser fast path through `node:querystring` | | master | Medium | a flat string (no `[`, `]`, `%5B` or `%5D`, and no key with more than 20 values) is parsed without qs, with qs's exact result; `node:querystring` itself can't give it (null prototype, no `__proto__` or empty-key dropping, no array limit, different malformed-escape decoding), so qs's decoder is copied. A differential fuzz against qs 6.17.1 and Express 5.3.0 (values, prototypes and key order, plus whether qs was called) passes 20,000 runs with each of two seeds and 200,000 runs of the cheaper properties, and 12 planted bugs each fail it. In-process timing per call, on a shared machine: 6.9x for `id=42`, 5.1x for 5 flat pairs, 3.1x for 20 pairs, 0.98x for a nested string that goes to qs. CI's instruction-count job couldn't run (GitHub Actions disabled); the new `query` scenario is in `benchmarks/count` | [#56](https://github.com/abedmurrar/express/pull/56) |
| [ ] | Skip ETag hashing work that can't change the output | | master | Small | bench and harness | |
| [ ] | Re-review the other perf PRs against the bench | PRs #7515, #6994 | master | Small | bench | |

## Additions on the compatible line

These are opt-in, and nothing existing changes.

| Status | Item | Upstream | Line | Size | Proof | PR |
|---|---|---|---|---|---|---|
| [ ] | `req.signal`, which aborts when the client disconnects | | master | Small | new tests | |
| [ ] | `diagnostics_channel` events | PR #6959 | master | Medium | new tests | |
| [ ] | `app.listRoutes()` | PR #7531, router#174 | master | Medium | new tests; router part arrives with the 2.3.0 re-sync | |
| [ ] | Explicit error-handler API (`app.error`, `router.error`); counting arguments still works | #2896, #3367, router#59 | master | Medium | new tests | |
| [ ] | Clearer error when a response is sent twice | #7560 | master | Small | new tests | |
| [ ] | `debug` warning for duplicate routes at startup | | master | Small | new tests | |
| [ ] | Opt-in strict routing on mount paths | #2281 | master | Medium | repro 2281 | |
| [ ] | Deprecation warnings for every 6.x removal below | | master | Small | warning tests | |
| [ ] | Deprecation warning for `res.send(object)` (it keeps working) | #2249, PR #7553 | master | Small | warning test | |
| [ ] | Stable `code` on every error Express throws | #6951, PR #6982 | master | Medium | new tests | |
| [ ] | Full matched route path on the request (`req.originalRoute`) | #2501 | master | Small | new tests | |
| [ ] | Warn about route paths that can never match | #2511 | master | Small | new tests | |
| [ ] | View lookup tries every registered engine for names without a known extension | #2708, #3485, PR #3569 | master | Medium | new tests | |

## Our 6.0

| Status | Item | Upstream | Line | Size | Proof | PR |
|---|---|---|---|---|---|---|
| [ ] | Create the `6.x` branch | | 6.x | Small | | |
| [ ] | `env` defaults to production when `NODE_ENV` is unset, and we keep reading `NODE_ENV` | #3346, PR #7549 | 6.x | Small | tests | |
| [ ] | Node.js 24 minimum | PR #7552, discussions#236 | 6.x | Small | superseded for now: both lines require Node 22 (Foundation row); 6.x decides later whether to drop 22 | |
| [ ] | Drop `X-Powered-By` | PR #7554 | 6.x | Small | test that the header is gone | |
| [ ] | `res.redirect` throws on a bad url or status | #6391, #6941, PR #6404 | 6.x | Small | tests | |
| [ ] | `req.get('referer')` prefers `Referer` | #3951, PR #6993 | 6.x | Small | tests | |
| [ ] | `cookie@1` | PR #6875 | 6.x | Small | tests | |
| [ ] | Remove the `res.set` Content-Type magic | #7145, PRs #7146, #7283 | 6.x | Small | tests and the ecosystem suite; dropped if any middleware breaks | |
| [ ] | `isAbsolute` default value | PR #5652 | 6.x | Small | tests | |
| [ ] | `res.links()` accepts arrays | PR #2738 | 6.x | Small | tests | |
| [ ] | Too many query parameters gives a 400 instead of dropping them | #5878, PRs #7117, #5901 | 6.x | Small | repro 5878 | |
| [ ] | Repeated query keys stay arrays up to the parameter limit | PR #7151 | 6.x | Small | repro 5878 | |
| [ ] | Extended query parser uses `allowPrototypes: false` | | 6.x | Small | tests | |
| [ ] | Numeric `trust proxy` throws at startup; X-Forwarded-Host/Proto use the trusted hop | #6541, PR #7387 | 6.x | Medium | tests | |
| [ ] | JSON bodies with `__proto__` or `constructor` keys get a 400 (vendor body-parser, use `secure-json-parse`) | | 6.x | Medium | tests | |
| [ ] | No ETag when `Cache-Control: no-store` | PR #6994 | 6.x | Small | tests | |
| [ ] | `req.query` is cached per request, so changes to it stick | PR #7517 | 6.x | Small | tests and bench | |
| [ ] | Null-prototype objects for `res.locals`, query and params | | 6.x | Small | tests, bench, and the ecosystem suite; dropped if any middleware breaks | |
| [ ] | `json serializer` setting, so plugins can use fast-json-stringify | #2422 | 6.x | Small | tests | |
| [ ] | Replace `depd` and `debug` with Node's `util.deprecate` and `util.debuglog` | discussions#459 | 6.x | Small | tests | |
| [ ] | Separate render `locals` from settings | PR #2648 | 6.x | Medium | tests | |
| [ ] | Decide and build sub-app settings inheritance | #2564, PR #7561 | 6.x | Medium | PR #7561's tests | |
| [x] | Ship TypeScript types in the repo, from `@types/express` | #2818, #6370, PR #6382 | master | Large | done by the TypeScript section (public types row) | [#48](https://github.com/abedmurrar/express/pull/48) |
| [ ] | Router: static method helpers plus `router.method()` | router#129, router#43 | 6.x | Medium | tests | |
| [ ] | Router: drop `is-promise` | router#137, router#136 | 6.x | Small | tests | |
| [ ] | Router: path-to-regexp 9, plus a migration note for the greedy-parameter change | | 6.x | Medium | tests | |
| [ ] | Router: order-preserving static-path index, from EriksRemess/express 51eb5cbb | | 6.x | Large | bench, harness, auth-bypass tests | |
| [ ] | `MIGRATING-6.md` and the History.md breaking-changes section | | 6.x | Medium | | |
| [ ] | Default error logger skips 4xx errors | #2263 | 6.x | Small | tests | |

## HTTP/2

| Status | Item | Upstream | Line | Size | Proof | PR |
|---|---|---|---|---|---|---|
| [ ] | HTTP/2 tests for the vendored router and send | discussions#407 | 6.x | Medium | tests | |
| [ ] | Express on `http2.createSecureServer({ allowHTTP1: true })`, fixing on-finished and the colon headers | #5462, #4959, PR #3730 | 6.x | Large | tests | |

## Docs

| Status | Item | Upstream | Line | Size | Proof | PR |
|---|---|---|---|---|---|---|
| [ ] | Express 5 path syntax: a clearer error and a migration page | #6711, #6724 | master | Small | | |
| [ ] | Testing without a port, using light-my-request | | master | Small | an example that runs | |
| [ ] | Graceful shutdown recipe | | master | Small | an example that runs | |
| [ ] | Cookies, SameSite and secure cookies behind proxies | | master | Small | | |
| [ ] | A page for every new API in this roadmap | | both | Small | | |
| [ ] | Fix JSDoc and README errors | #7525, #7588, #7592, PRs #6133, #7388, #7452, #7470, #7526, #7534, #7593 | master | Small | | |
| [ ] | Examples: fix security bugs and outdated dependencies | PRs #5225, #6153, #6286, #6689, #7059, #7061, #7092, #7495, #7496 | master | Small | examples run | |

## Won't do

| Item | Upstream | Why |
|---|---|---|
| Bring back `*` and `?` routes | #6711 | path-to-regexp 8 removed them on purpose; we document the new syntax instead |
| Case-insensitive `req.get` on hand-edited headers | PR #7395 | Node documents headers as lowercase; Express shouldn't patch over code that breaks that |
| Remove `express.json`, `express.static` and the other re-exports | PRs #7550, #7551 | They're the most-used Express APIs, and removing them gains users nothing |
| BigInt status codes and BigInt in `res.send` | #6756, PR #7408 | Invalid input; it should fail, not be supported |
| Fastify-style hooks, plugin encapsulation, ajv validation, pino in core | | They break middleware that relies on the real `req`/`res`; they belong in plugins |
| Make `res.send(object)` throw | #2249, PR #7553 | Community middleware and error handlers send objects with `res.send`; it keeps working, with a deprecation warning that points to `res.json` |
| Auto-send a handler's return value | | `return res.json(x)` is common, so the behaviour would be ambiguous |
| Compile handlers into static responses | | Breaks `Connection: close` and `If-None-Match: *`, and depends on `Function.prototype.toString` |
| Leave `node:http` (for uWebSockets.js or similar) | | We'd lose Node's header and request-smuggling protection |
| Cosmetic `var` → `const` and syntax rewrites as separate PRs | | No behaviour or speed gain; the TypeScript conversion rewrites every file anyway |
| ESM-only packaging | #6739 | On Node 24, `import` already works with the CommonJS build |
| Rename or reshape the settings API (`app.set`/`app.get`) | #2216, PRs #3714, #4044 | Breaks every app for no user gain |
| More settings knobs and per-request setting overrides | #3536, #5006, PRs #2935, #3613, #5007, #5856 | Hidden state and more config; pass options to the call instead |
| Server-Sent Events helper in core | #7334, PR #7338 | A few lines with `res.write`; a separate package can offer it |
| Cookie encryption in `res.cookie` | #5995, PR #7113 | Belongs in cookie-session or a dedicated package |
| Drop `qs` and the extended query parser | PR #6865 | Breaks every app that uses nested query objects |
| HTTP/2 server push | #2781 | Browsers removed server push |
| ETag that varies by CORS headers | #5986, PR #6884 | Set `Vary: Origin` instead; Express's ETag describes the body |
| Path containment for view names | #7140, PR #7142 | View names are not user input, and containment breaks absolute view paths |

## Releases

Modelled on the objection fork's release flow. Publishing itself waits for your go-ahead (next section).

| Status | Item | Line | Proof | PR |
|---|---|---|---|---|
| [x] | An `Unreleased (fork)` section in History.md, and `npm run release -- patch\|minor`, which dates that section, bumps the version, commits and tags (and refuses an empty Unreleased section) | master | a dry run | [#25](https://github.com/abedmurrar/express/pull/25) |
| [x] | `release.yml` on `v*` tags: runs the tests, checks the tag matches `package.json`, publishes with `npm publish --provenance` (trusted publishing rather than a stored token), and creates the GitHub release from the changelog | master | a dry run on a test tag | [#25](https://github.com/abedmurrar/express/pull/25) |
| [ ] | A patch or minor release for every merge that changes `lib/`, once publishing is approved; anything breaking only on the `6.x` line | both | | |

## Later, with your go-ahead

- Publish to npm as `@abedmurrar/express`.

## Keeping up with upstream

- `git fetch upstream && git merge upstream/master` into `master` every week, or whenever upstream releases. The differential harness then runs against the new upstream release.
- Vendored packages: compare the upstream releases of `router` and `send` against the version in `VENDORED.md`, and port their fixes by hand, naming the upstream commit.
- Re-dump issues and PRs with `research/dump.sh`, and add new items to the appendix.

## Appendix: every open upstream issue and pull request

Generated by `node research/build-appendix.js` from `research/appendix-decisions.json` and the upstream snapshot in `research/raw/` (2026-11-21). Edit the JSON, not this section.

"Roadmap" and "Cherry-pick" name the roadmap item that covers the entry. "Cherry-pick" means we take that PR's code.

### Issues (114)

Already fixed 2, Duplicate 1, Roadmap 56, Support question 7, Upstream process 3, Won't do 45.

| Issue | Title | Decision | Item or reason |
|---|---|---|---|
| [#1980](https://github.com/expressjs/express/issues/1980) | Please add app.route('foo').use() | Won't do | Route handlers already take middleware arguments; a route-level use() adds API for no gain. |
| [#2151](https://github.com/expressjs/express/issues/2151) | Params registered on app available in routers used by app | Won't do | Routers are independent of the app by design; register shared param callbacks on each router with a helper. |
| [#2216](https://github.com/expressjs/express/issues/2216) | remove .get() and .set() functions for settings | Won't do | Renaming or reshaping the settings API breaks every app for no user gain; app.set and app.get stay. |
| [#2217](https://github.com/expressjs/express/issues/2217) | refactor view engine | Won't do | A view-engine rewrite belongs in a separate package; we only fix lookup and render bugs. |
| [#2246](https://github.com/expressjs/express/issues/2246) | Make automatic OPTIONS responses configurable | Won't do | Defining your own OPTIONS handler already replaces the automatic one; CORS belongs in the cors package. |
| [#2247](https://github.com/expressjs/express/issues/2247) | Make automatic HEAD -> GET configurable | Won't do | Registering app.head() before app.get() already overrides it; a setting adds config for no gain. |
| [#2249](https://github.com/expressjs/express/issues/2249) | Deprecate res.send(obj) json overload | Roadmap | Deprecation warning for `res.send(object)` (it keeps working) |
| [#2263](https://github.com/expressjs/express/issues/2263) | Default responder should not console.error 4xx errors | Roadmap | Default error logger skips 4xx errors |
| [#2281](https://github.com/expressjs/express/issues/2281) | '/' route breaks strict routing | Roadmap | Opt-in strict routing on mount paths |
| [#2414](https://github.com/expressjs/express/issues/2414) | route() should handle 405 Method not allowed | Won't do | Express can't know every allowed method across middleware; 405 handling belongs in middleware. |
| [#2432](https://github.com/expressjs/express/issues/2432) | Move req / res prototype extension to a separate repo | Won't do | Moving req/res extensions to another package is churn with no user benefit for our fork. |
| [#2472](https://github.com/expressjs/express/issues/2472) | Option to disable ETag for certain routes? | Roadmap | No ETag when `Cache-Control: no-store` |
| [#2474](https://github.com/expressjs/express/issues/2474) | Feature request: Add a custom event `render` (due `req.route` & routing middleware nature) | Won't do | A render event adds magic; set res.locals in middleware or wrap res.render instead. |
| [#2483](https://github.com/expressjs/express/issues/2483) | Route param error handle | Won't do | Moving param errors into route-level handlers changes error flow; catch them after the route. |
| [#2501](https://github.com/expressjs/express/issues/2501) | Add originalRoute like originalUrl | Roadmap | Full matched route path on the request (`req.originalRoute`) |
| [#2511](https://github.com/expressjs/express/issues/2511) | Reject routes containing an unescaped space character | Roadmap | Warn about route paths that can never match |
| [#2524](https://github.com/expressjs/express/issues/2524) | Add "set" Method to "Router" | Won't do | Settings live on apps by design; use a sub-app when a section needs its own settings. |
| [#2526](https://github.com/expressjs/express/issues/2526) | path specific error handler not called | Support question |  |
| [#2552](https://github.com/expressjs/express/issues/2552) | Fix setting inheritance | Roadmap | Decide and build sub-app settings inheritance |
| [#2562](https://github.com/expressjs/express/issues/2562) | Application may be a class | Won't do | Turning the app into a class is a refactor with no user gain and breaks the function mixin. |
| [#2563](https://github.com/expressjs/express/issues/2563) | Simplify app.all and app.VERB | Roadmap | Router: static method helpers plus `router.method()` |
| [#2564](https://github.com/expressjs/express/issues/2564) | Shouldn't app.set("case sensitive routing") propagate to new Routers? | Roadmap | Decide and build sub-app settings inheritance |
| [#2575](https://github.com/expressjs/express/issues/2575) | links() function insufficient for attributes other than `rel` | Roadmap | `res.links()` accepts arrays |
| [#2603](https://github.com/expressjs/express/issues/2603) | Multiple callbacks on app.param. Eg: app.param('resource', cb1, cb2) | Support question |  |
| [#2698](https://github.com/expressjs/express/issues/2698) | debug module with dynamic behavior (enable/disable in runtime) | Won't do | Runtime toggling is the debug package's concern, and we are moving to util.debuglog. |
| [#2708](https://github.com/expressjs/express/issues/2708) | Feature request View global option ignore extname | Roadmap | View lookup tries every registered engine for names without a known extension |
| [#2739](https://github.com/expressjs/express/issues/2739) | Question: Is there a way to identify a route and create href link to it? | Won't do | Named routes and URL generation belong in a plugin, not core. |
| [#2756](https://github.com/expressjs/express/issues/2756) | feat: Support typed params in routes | Won't do | Param typing and coercion belong in validation middleware, not the router. |
| [#2781](https://github.com/expressjs/express/issues/2781) | Feature request: friendly exposure of req/res logic for HTTP/2 push promises | Won't do | Browsers removed HTTP/2 server push, so there is nothing worth exposing. |
| [#2811](https://github.com/expressjs/express/issues/2811) | Express and middleware that manipulate reponses | Won't do | Response transforms belong in middleware such as on-headers, not a core hook API. |
| [#2812](https://github.com/expressjs/express/issues/2812) | Decoupling express.request and express.response from express application | Won't do | req/res prototypes depend on server state; for tests use light-my-request as the docs will show. |
| [#2818](https://github.com/expressjs/express/issues/2818) | include "typings" field in package.json | Roadmap | Ship TypeScript types in the repo, from `@types/express` |
| [#2878](https://github.com/expressjs/express/issues/2878) | Support for auto-generated Accept-Patch header | Won't do | Too niche for core; set Accept-Patch in the handler that supports PATCH. |
| [#2888](https://github.com/expressjs/express/issues/2888) | discuss commit guidelines | Upstream process |  |
| [#2896](https://github.com/expressjs/express/issues/2896) | Define error-handling middleware functions explicitly (without arity detection) | Roadmap | Explicit error-handler API (`app.error`, `router.error`); counting arguments still works |
| [#2907](https://github.com/expressjs/express/issues/2907) | View composers | Won't do | Scope creep: view composers belong in a template-engine plugin. |
| [#2945](https://github.com/expressjs/express/issues/2945) | Make express.static use the "etag" application setting | Won't do | express.static is standalone middleware with its own options; reading app settings couples them. |
| [#2982](https://github.com/expressjs/express/issues/2982) | Rendering engine without view files | Support question |  |
| [#3057](https://github.com/expressjs/express/issues/3057) | app.locals not passed down to a subapp | Roadmap | Decide and build sub-app settings inheritance |
| [#3062](https://github.com/expressjs/express/issues/3062) | Debug namespace is not microservices (SOA) oriented | Won't do | Namespace naming is the debug package's concern, and we are moving to util.debuglog. |
| [#3097](https://github.com/expressjs/express/issues/3097) | Add req.search property containing unparsed query string | Won't do | parseurl(req).search already gives the raw query string; another property adds little. |
| [#3346](https://github.com/expressjs/express/issues/3346) | default env to production | Roadmap | `env` defaults to production when `NODE_ENV` is unset, and we keep reading `NODE_ENV` |
| [#3367](https://github.com/expressjs/express/issues/3367) | Suggestion: Implicitly-named error handler | Roadmap | Explicit error-handler API (`app.error`, `router.error`); counting arguments still works |
| [#3379](https://github.com/expressjs/express/issues/3379) | Allow for multiple parameter names in router.param() | Won't do | Handlers already read all params from req.params; multi-name param callbacks add complexity. |
| [#3485](https://github.com/expressjs/express/issues/3485) | Auto file extension lookup with multiple view engines | Roadmap | View lookup tries every registered engine for names without a known extension |
| [#3536](https://github.com/expressjs/express/issues/3536) | Feature request: ability to set settings per response | Won't do | Per-response settings overrides add hidden state; pass options to the call instead. |
| [#3555](https://github.com/expressjs/express/issues/3555) | node http code change could have major effect on express | Roadmap | Skip the per-request prototype swap when `app.listen()` made the server |
| [#3798](https://github.com/expressjs/express/issues/3798) | Strict Routing | Roadmap | Mount-path edge case from #3798 |
| [#3945](https://github.com/expressjs/express/issues/3945) | why not make middleware or hooks that works exactly before sending response that could change or alter the response object | Won't do | Scope creep: pre-send hooks belong in middleware such as on-headers. |
| [#3951](https://github.com/expressjs/express/issues/3951) | express checks referrer first, then referer next | Roadmap | `req.get('referer')` prefers `Referer` |
| [#4059](https://github.com/expressjs/express/issues/4059) | Rewriting req.url in router with prefix path results in missing slash (/) | Roadmap | A `req.url` rewrite in a mounted router loses a slash |
| [#4099](https://github.com/expressjs/express/issues/4099) | Change the interface for setting application settings | Duplicate | of #2216 |
| [#4186](https://github.com/expressjs/express/issues/4186) | Zone.js for async error handling | Won't do | Express 5 already forwards rejected promises, and AsyncLocalStorage replaces Zone.js. |
| [#4298](https://github.com/expressjs/express/issues/4298) | req.params undefined with unspecified res.format default | Won't do | By design: req.params belong to the matched route and reset when the error leaves it. |
| [#4523](https://github.com/expressjs/express/issues/4523) | Router events (enabling route documentation) – feature request | Roadmap | `app.listRoutes()` |
| [#4536](https://github.com/expressjs/express/issues/4536) | Some fetch similarities | Won't do | Body reading belongs to body-parser, and Node's stream/consumers already offers json(req) and text(req). |
| [#4557](https://github.com/expressjs/express/issues/4557) | `App.use(path, ...)` Does Not Mount at `'//'` | Roadmap | A `//` mount also matches `/` |
| [#4594](https://github.com/expressjs/express/issues/4594) | `ext` should be case-insensitive for view engines. | Roadmap | View engine extension matching ignores case |
| [#4697](https://github.com/expressjs/express/issues/4697) | Request: Introduce a `req.completeURL()` method | Won't do | It is one line from req.protocol, req.host and req.originalUrl; not worth new API. |
| [#4750](https://github.com/expressjs/express/issues/4750) | custom ETag function isn't working for SendFile | Roadmap | `sendFile` ignores a per-call `etag: false` |
| [#4755](https://github.com/expressjs/express/issues/4755) | Ability to get req and res context inside json replacer | Roadmap | `json serializer` setting, so plugins can use fast-json-stringify |
| [#4889](https://github.com/expressjs/express/issues/4889) | How to hold a response? And are there something called "maxHeldResponseCount"? | Support question |  |
| [#4944](https://github.com/expressjs/express/issues/4944) | response.download does not return /proc/* files | Roadmap | `/proc` files are sent empty |
| [#4959](https://github.com/expressjs/express/issues/4959) | SNICallback native | Roadmap | Express on `http2.createSecureServer({ allowHTTP1: true })`, fixing on-finished and the colon headers |
| [#5004](https://github.com/expressjs/express/issues/5004) | Issue a warning when GET route declared before HEAD | Roadmap | `debug` warning for duplicate routes at startup |
| [#5006](https://github.com/expressjs/express/issues/5006) | Router mergerParams setting on app initialization | Won't do | A global mergeParams setting is more config; pass mergeParams to each router. |
| [#5008](https://github.com/expressjs/express/issues/5008) | ERR_EMPTY_RESPONSE every time i try to access from a device not local | Support question |  |
| [#5150](https://github.com/expressjs/express/issues/5150) | res.cookie does not allow setting Max-Age only, without Expires (One should be able to set maxAge alone, with expires: 0) | Roadmap | `res.cookie` adds Expires despite `expires: 0` |
| [#5249](https://github.com/expressjs/express/issues/5249) | Extension to add Global Error Handler/Response Handler | Won't do | A final error-handling middleware already is the global handler; response envelopes are app code. |
| [#5309](https://github.com/expressjs/express/issues/5309) | Split the examples from this repo | Upstream process |  |
| [#5462](https://github.com/expressjs/express/issues/5462) | http/2 initiative | Roadmap | Express on `http2.createSecureServer({ allowHTTP1: true })`, fixing on-finished and the colon headers |
| [#5623](https://github.com/expressjs/express/issues/5623) | [v5] Lock down valid status code ranges to 1xx through 5xx | Won't do | Express 5 already validates 100-999 like Node; tightening to 1xx-5xx breaks apps for little gain. |
| [#5626](https://github.com/expressjs/express/issues/5626) | Can not set response headers when send a json body in a options request | Already fixed | Repro research/repro/5626.js does not reproduce on master: 200 with the header and body. |
| [#5878](https://github.com/expressjs/express/issues/5878) | Query Param Silently Remove param query value if it is over 1000 | Roadmap | Too many query parameters gives a 400 instead of dropping them |
| [#5906](https://github.com/expressjs/express/issues/5906) | Cache `accepts` Instance in Request Methods? | Roadmap | Cache the `accepts` instance per request |
| [#5986](https://github.com/expressjs/express/issues/5986) | ETag should consider CORS headers | Won't do | Not Express's job: set Vary: Origin; ETags shouldn't depend on CORS headers. |
| [#5995](https://github.com/expressjs/express/issues/5995) | Add encryption as a new feature/option to the cookies provided with secret | Won't do | Cookie encryption belongs in cookie-session or a dedicated package, not res.cookie. |
| [#6039](https://github.com/expressjs/express/issues/6039) | Response built by express is broken if res and req don't extend node's http.IncomingMessage and http.ServerResponse | Won't do | Express targets node:http objects; foreign req/res implementations must extend Node's classes. |
| [#6370](https://github.com/expressjs/express/issues/6370) | wrong signature for req.body and next() | Roadmap | Ship TypeScript types in the repo, from `@types/express` |
| [#6385](https://github.com/expressjs/express/issues/6385) | Typings for Send accept a Promise but the function doesn't await it | Roadmap | Ship TypeScript types in the repo, from `@types/express` |
| [#6395](https://github.com/expressjs/express/issues/6395) | Proposal: Implementation of Short-Term In-Memory Cache in Express for Mitigating Traffic Spikes and Preventing DDoS | Won't do | Scope creep: caching and DDoS protection belong in a proxy or middleware. |
| [#6541](https://github.com/expressjs/express/issues/6541) | "trust proxy" callback called multiple times on single request | Roadmap | Numeric `trust proxy` throws at startup; X-Forwarded-Host/Proto use the trusted hop |
| [#6579](https://github.com/expressjs/express/issues/6579) | Combinations of middleware series with "app.all" is broken since 4.18.0 | Won't do | The router yields every 100 sync layers to avoid stack overflows; code relying on full sync runs must change. |
| [#6647](https://github.com/expressjs/express/issues/6647) | Dependency graph improvements (via npmgraph.js.org) | Won't do | Most duplicates come from qs, which we keep; the statuses duplicate is already fixed. |
| [#6669](https://github.com/expressjs/express/issues/6669) | The Great Monkey-Patch Safari | Roadmap | Express on `http2.createSecureServer({ allowHTTP1: true })`, fixing on-finished and the colon headers |
| [#6711](https://github.com/expressjs/express/issues/6711) | Restore Support for app.all('*') Wildcard in Express v5 | Won't do | path-to-regexp 8 removed `*` and `?` on purpose; we document the new syntax instead (Won't do table). |
| [#6724](https://github.com/expressjs/express/issues/6724) | TypeError: Missing parameter name at 2: https://git.new/pathToRegexpError | Roadmap | Express 5 path syntax: a clearer error and a migration page |
| [#6739](https://github.com/expressjs/express/issues/6739) | (FR): esm support | Won't do | On Node 24, import already works with the CommonJS build (Won't do table). |
| [#6756](https://github.com/expressjs/express/issues/6756) | `TypeError: Do not know how to serialize a BigInt` when using sendStatus with a BigNum instead of intended error message | Won't do | BigInt status codes are invalid input and should fail, not be supported (Won't do table). |
| [#6809](https://github.com/expressjs/express/issues/6809) | Router cycles cause silent runtime hangs | Roadmap | A router cycle gives a stack overflow instead of a clear error |
| [#6863](https://github.com/expressjs/express/issues/6863) | How to use Express server with `http2.createSecureServer` for HTTP/2? | Support question |  |
| [#6926](https://github.com/expressjs/express/issues/6926) | I am unable to set cookies in vercel app for my application. While my backend is deployed in render. | Support question |  |
| [#6941](https://github.com/expressjs/express/issues/6941) | res.redirect(undefined) sends invalid Location: undefined header | Roadmap | `res.redirect` throws on a bad url or status |
| [#6951](https://github.com/expressjs/express/issues/6951) | Standardize on error codes for errors express throws | Roadmap | Stable `code` on every error Express throws |
| [#7034](https://github.com/expressjs/express/issues/7034) | res.set('Content-Type') silently sets header to literal string 'false' for unknown types | Roadmap | `res.set` sends `Content-Type: false` for unknown types |
| [#7140](https://github.com/expressjs/express/issues/7140) | View.prototype.lookup() lacks path containment check (unlike send library for res.sendFile) | Won't do | View names are not user input; containment would break absolute view paths (working as designed). |
| [#7145](https://github.com/expressjs/express/issues/7145) | Remove magic from `res.set` | Roadmap | Remove the `res.set` Content-Type magic |
| [#7231](https://github.com/expressjs/express/issues/7231) | Docs: Add instructions for TypeScript | Roadmap | Ship TypeScript types in the repo, from `@types/express` |
| [#7334](https://github.com/expressjs/express/issues/7334) | Propuesta: Abstracción nativa/wrapper en Express para simplificar el manejo de respuestas SSE (Server-Sent Events) | Won't do | SSE is a few lines with res.write; a helper belongs in a separate package. |
| [#7350](https://github.com/expressjs/express/issues/7350) | res.render()/app.render() throws opaque TypeError for a view name ending in "." | Roadmap | A view name ending in `.` throws synchronously |
| [#7362](https://github.com/expressjs/express/issues/7362) | res.send(ArrayBuffer) silently sends {} as JSON | Roadmap | `res.send` corrupts ArrayBuffer, DataView and typed-array bodies |
| [#7427](https://github.com/expressjs/express/issues/7427) | router.use() silently accepts express() sub-apps without prototype restoration | Roadmap | `router.use(subApp)` restores req/res prototypes like `app.use` |
| [#7502](https://github.com/expressjs/express/issues/7502) | Express: review of dependencies and sub dependencies | Upstream process |  |
| [#7506](https://github.com/expressjs/express/issues/7506) | res.redirect() sets Content-Length when Transfer-Encoding is already set | Roadmap | `res.redirect` sends Content-Length with Transfer-Encoding |
| [#7510](https://github.com/expressjs/express/issues/7510) | res.send(DataView) silently drops the view’s bytes | Roadmap | `res.send` corrupts ArrayBuffer, DataView and typed-array bodies |
| [#7525](https://github.com/expressjs/express/issues/7525) | JSDoc for the req.query getter documents the wrong return type | Roadmap | Fix JSDoc and README errors |
| [#7527](https://github.com/expressjs/express/issues/7527) | Readme: project name 'express.js' is not capitalized | Won't do | Cosmetic README wording with no user impact. |
| [#7532](https://github.com/expressjs/express/issues/7532) | req.subdomains splits an IPv6 host that contains dots | Roadmap | `req.subdomains` splits IPv6 literals |
| [#7538](https://github.com/expressjs/express/issues/7538) | res.send() with a non-Uint8Array typed array loses data, or returns 500 without ETag | Roadmap | `res.send` corrupts ArrayBuffer, DataView and typed-array bodies |
| [#7547](https://github.com/expressjs/express/issues/7547) | Update to mocha 12.x | Roadmap | Update mocha and supertest |
| [#7560](https://github.com/expressjs/express/issues/7560) | res.render() crashes the process with an uncaught ERR_HTTP_HEADERS_SENT when the response was already sent | Roadmap | `res.render` after a send crashes the process |
| [#7564](https://github.com/expressjs/express/issues/7564) | Express 4: update body-parser minimum to 1.20.9 for security fix | Already fixed | Express 4 only: 4.x pins body-parser ~1.20.9 via merged #7565; our master uses body-parser ^2.4.0. |
| [#7588](https://github.com/expressjs/express/issues/7588) | Outdated res.send() syntax in lib/response.js documentation example | Roadmap | Fix JSDoc and README errors |
| [#7592](https://github.com/expressjs/express/issues/7592) | Use cross-platform directory name in QS guide | Roadmap | Fix JSDoc and README errors |

### Pull requests (149)

Already fixed 2, Cherry-pick 42, Duplicate 9, Roadmap 45, Upstream process 10, Won't do 41.

| PR | Title | Decision | Item or reason |
|---|---|---|---|
| [#2422](https://github.com/expressjs/express/pull/2422) | Optional custom json replacer/spaces per response | Roadmap | `json serializer` setting, so plugins can use fast-json-stringify |
| [#2653](https://github.com/expressjs/express/pull/2653) | Resolve paths for views asynchronously | Cherry-pick | Async view lookup (no sync file I/O after startup) |
| [#2738](https://github.com/expressjs/express/pull/2738) | feat: Add array support to res.links() | Cherry-pick | `res.links()` accepts arrays |
| [#2935](https://github.com/expressjs/express/pull/2935) | Add support for overriding settings per request | Won't do | Per-request settings overrides add hidden state; pass options to the call instead. |
| [#3114](https://github.com/expressjs/express/pull/3114) | Options for Engines | Won't do | A custom View class via app.set('view') already bypasses the file system. |
| [#3427](https://github.com/expressjs/express/pull/3427) | Updating a couple of examples to ES6 syntax | Won't do | Cosmetic syntax rewrite with no behaviour or speed gain (Won't do table). |
| [#3538](https://github.com/expressjs/express/pull/3538) | Example updated to ES6 syntax | Won't do | Cosmetic syntax rewrite with no behaviour or speed gain (Won't do table). |
| [#3569](https://github.com/expressjs/express/pull/3569) | Auto file extension lookup with multiple view engines | Roadmap | View lookup tries every registered engine for names without a known extension |
| [#3613](https://github.com/expressjs/express/pull/3613) | Add "view options" settings for rendering engines | Won't do | Another settings knob; pass engine options to res.render or app.locals. |
| [#3714](https://github.com/expressjs/express/pull/3714) | Move settings methods to app.settings and deprecate old versions | Won't do | Renaming or reshaping the settings API breaks every app for no user gain; app.set and app.get stay. |
| [#3730](https://github.com/expressjs/express/pull/3730) | Support http/2. | Roadmap | Express on `http2.createSecureServer({ allowHTTP1: true })`, fixing on-finished and the colon headers |
| [#3770](https://github.com/expressjs/express/pull/3770) | Allow to bypass middleware to last layer with next('last') | Won't do | A magic string in next() is the wrong API; split the stack into routers instead. |
| [#3981](https://github.com/expressjs/express/pull/3981) | Provision to pass json replacer with a set of options. | Roadmap | `json serializer` setting, so plugins can use fast-json-stringify |
| [#4044](https://github.com/expressjs/express/pull/4044) | added the ability to for app.set to accept a json of settings | Won't do | Renaming or reshaping the settings API breaks every app for no user gain; app.set and app.get stay. |
| [#4680](https://github.com/expressjs/express/pull/4680) | Express with SSL example | Won't do | A new example app on a dead base branch; our docs pages cover these topics instead. |
| [#4794](https://github.com/expressjs/express/pull/4794) | Issue #4788 - ESM Module Example | Won't do | A new example app on a dead base branch; our docs pages cover these topics instead. |
| [#4942](https://github.com/expressjs/express/pull/4942) | TypeScript Example (CJS) | Won't do | A new example app on a dead base branch; our docs pages cover these topics instead. |
| [#4946](https://github.com/expressjs/express/pull/4946) | Clean architecture example | Won't do | A new example app on a dead base branch; our docs pages cover these topics instead. |
| [#4958](https://github.com/expressjs/express/pull/4958) | Implemented req.completeUrl | Won't do | It is one line from req.protocol, req.host and req.originalUrl; not worth new API. |
| [#5007](https://github.com/expressjs/express/pull/5007) | "merge params" option | Won't do | A global mergeParams setting is more config; pass mergeParams to each router. |
| [#5151](https://github.com/expressjs/express/pull/5151) | Don't automatically add Expires in res.cookie if expires option is explicitly set to 0 | Cherry-pick | `res.cookie` adds Expires despite `expires: 0` |
| [#5225](https://github.com/expressjs/express/pull/5225) | Updated for modern versions of Node Redis | Roadmap | Examples: fix security bugs and outdated dependencies |
| [#5311](https://github.com/expressjs/express/pull/5311) | Split examples from Express Core | Upstream process |  |
| [#5320](https://github.com/expressjs/express/pull/5320) | Do not auto-remove content headers for body-less status codes | Won't do | Stripping content headers on 204 and 304 is correct and saves bytes. |
| [#5492](https://github.com/expressjs/express/pull/5492) | New Integration tests (example split continuation) | Upstream process |  |
| [#5503](https://github.com/expressjs/express/pull/5503) | add Github Access Structure Overview section | Upstream process |  |
| [#5652](https://github.com/expressjs/express/pull/5652) | Add default value to the isAbsolute function of utils | Cherry-pick | `isAbsolute` default value |
| [#5662](https://github.com/expressjs/express/pull/5662) | WIP: release process ascii diagram | Upstream process |  |
| [#5856](https://github.com/expressjs/express/pull/5856) | feat(response): new setting strict status codes | Won't do | Express 5 already validates 100-999 like Node; a strictness setting adds config. |
| [#5901](https://github.com/expressjs/express/pull/5901) | allow overwrite of req.query on subsequent query parser middleware use | Roadmap | Too many query parameters gives a 400 instead of dropping them |
| [#6047](https://github.com/expressjs/express/pull/6047) | Fix inheritance should not overwrite the methods on res and req with the ones from http.ServerResponse and http.IncomingMessage | Won't do | Express targets node:http objects; foreign req/res implementations must extend Node's classes. |
| [#6086](https://github.com/expressjs/express/pull/6086) | Enhance req.acceptsEncodings | Won't do | Rewrites a working method with no bug to fix; accepts already handles these inputs. |
| [#6101](https://github.com/expressjs/express/pull/6101) | Refactor req.is for cleaner argument handling | Won't do | Cosmetic syntax rewrite with no behaviour or speed gain (Won't do table). |
| [#6110](https://github.com/expressjs/express/pull/6110) | chore: add pull request template | Upstream process |  |
| [#6113](https://github.com/expressjs/express/pull/6113) | deps: upgrade cookie, cookie-parser and cookie-session | Roadmap | `cookie@1` |
| [#6118](https://github.com/expressjs/express/pull/6118) | deps: upgrade eslint | Roadmap | ESLint 9 and a pre-commit lint hook |
| [#6126](https://github.com/expressjs/express/pull/6126) | Refactor: streamline method assignment in app | Won't do | Cosmetic syntax rewrite with no behaviour or speed gain (Won't do table). |
| [#6133](https://github.com/expressjs/express/pull/6133) | docs: update JSDoc for req.host getter | Roadmap | Fix JSDoc and README errors |
| [#6136](https://github.com/expressjs/express/pull/6136) | Refactor: improve query parsing logic and update JSDoc | Won't do | Cosmetic syntax rewrite with no behaviour or speed gain (Won't do table). |
| [#6138](https://github.com/expressjs/express/pull/6138) | Refactor: simplify req.acceptsCharsets with spread syntax | Won't do | Cosmetic syntax rewrite with no behaviour or speed gain (Won't do table). |
| [#6139](https://github.com/expressjs/express/pull/6139) | Refactor: simplify req.acceptsEncodings with spread syntax | Won't do | Cosmetic syntax rewrite with no behaviour or speed gain (Won't do table). |
| [#6140](https://github.com/expressjs/express/pull/6140) | Refactor req.accepts to utilize rest parameters for better argument handling | Won't do | Cosmetic syntax rewrite with no behaviour or speed gain (Won't do table). |
| [#6145](https://github.com/expressjs/express/pull/6145) | Update index.js | Won't do | A version-specific comment in an example; the path-syntax migration page covers it. |
| [#6153](https://github.com/expressjs/express/pull/6153) | Update obsolete code of index.js of example "online" | Roadmap | Examples: fix security bugs and outdated dependencies |
| [#6286](https://github.com/expressjs/express/pull/6286) | fix: update online example to support Redis v4+ and remove outdated dependency | Roadmap | Examples: fix security bugs and outdated dependencies |
| [#6306](https://github.com/expressjs/express/pull/6306) | Test for view.prototype.render | Won't do | Its assertions are self-fulfilling per maintainer review, so they prove nothing. |
| [#6382](https://github.com/expressjs/express/pull/6382) | feat: Moving types into the repo | Cherry-pick | Ship TypeScript types in the repo, from `@types/express` |
| [#6404](https://github.com/expressjs/express/pull/6404) | feat(res.redirect): add validation for url and status arguments | Cherry-pick | `res.redirect` throws on a bad url or status |
| [#6412](https://github.com/expressjs/express/pull/6412) | docs: include a dependencies navigator | Upstream process |  |
| [#6480](https://github.com/expressjs/express/pull/6480) | add ESLint pre-commit hook to enforce code quality | Roadmap | ESLint 9 and a pre-commit lint hook |
| [#6689](https://github.com/expressjs/express/pull/6689) | chore: improve regexes in examples | Roadmap | Examples: fix security bugs and outdated dependencies |
| [#6703](https://github.com/expressjs/express/pull/6703) | test: enhance req.is() tests with additional cases | Already fixed | Every test it adds (15) is already in test/req.is.js on master (18 tests); checked 2026-11-21 |
| [#6742](https://github.com/expressjs/express/pull/6742) | feat: dump bodies of get/head reqs | Won't do | Node already dumps unread request bodies when the response ends; this pokes stream internals. |
| [#6758](https://github.com/expressjs/express/pull/6758) | fix: display the correct message when passing a `bigint` to `res.status`. | Won't do | BigInt status codes are invalid input and should fail, not be supported (Won't do table). |
| [#6786](https://github.com/expressjs/express/pull/6786) | Update in changelog (History.md) wrt pillarjs/send/HISTORY.md | Upstream process |  |
| [#6800](https://github.com/expressjs/express/pull/6800) | refactor: modernize View#lookup | Won't do | Cosmetic syntax rewrite with no behaviour or speed gain (Won't do table). |
| [#6856](https://github.com/expressjs/express/pull/6856) | test: fix static file tests for supertest 7+ URL normalization | Duplicate | of #7600 |
| [#6865](https://github.com/expressjs/express/pull/6865) | Remove direct `qs` dependency | Won't do | We keep the extended parser; dropping qs breaks every app that uses nested query objects. |
| [#6875](https://github.com/expressjs/express/pull/6875) | fix(res): handle null maxAge gracefully in res.cookie() and updated the dependency "cookie" to the 1.0.2 latest version | Cherry-pick | `cookie@1` |
| [#6884](https://github.com/expressjs/express/pull/6884) | res: include Access-Control-Allow-Origin when generating ETag | Won't do | Not Express's job: set Vary: Origin; ETags shouldn't depend on CORS headers. |
| [#6892](https://github.com/expressjs/express/pull/6892) | test: add test for req.host with comma-separated X-Forwarded-Host | Roadmap | Port upstream test-coverage PRs |
| [#6893](https://github.com/expressjs/express/pull/6893) | test: add test for ignoring comma-separated X-Forwarded-Host when trust proxy disabled | Roadmap | Port upstream test-coverage PRs |
| [#6912](https://github.com/expressjs/express/pull/6912) | update to eslint 9 | Roadmap | ESLint 9 and a pre-commit lint hook |
| [#6959](https://github.com/expressjs/express/pull/6959) | feat: add diagnostics_channel support for request lifecycle, middleware, and route events | Cherry-pick | `diagnostics_channel` events |
| [#6970](https://github.com/expressjs/express/pull/6970) | chore(ci): npm-publish via reusable workflows | Upstream process |  |
| [#6982](https://github.com/expressjs/express/pull/6982) | feat: add stable error codes to errors thrown by Express | Roadmap | Stable `code` on every error Express throws |
| [#6993](https://github.com/expressjs/express/pull/6993) | fix: prefer Referer header over Referrer | Cherry-pick | `req.get('referer')` prefers `Referer` |
| [#6994](https://github.com/expressjs/express/pull/6994) | Prevent ETag generation when Cache-Control: no-store is set | Cherry-pick | No ETag when `Cache-Control: no-store` |
| [#7008](https://github.com/expressjs/express/pull/7008) | perf: cache accepts instance on request object | Cherry-pick | Cache the `accepts` instance per request |
| [#7035](https://github.com/expressjs/express/pull/7035) | fix: prevent Content-Type header from being set to 'false' | Cherry-pick | `res.set` sends `Content-Type: false` for unknown types |
| [#7038](https://github.com/expressjs/express/pull/7038) | test: add unit tests for compileQueryParser, compileTrust, and normalizeTypes | Roadmap | Port upstream test-coverage PRs |
| [#7041](https://github.com/expressjs/express/pull/7041) | feat: add diagnostics_channel support for app initialization | Roadmap | `diagnostics_channel` events |
| [#7045](https://github.com/expressjs/express/pull/7045) | fix: non standard status code will result in undefined | Duplicate | of #7407 |
| [#7050](https://github.com/expressjs/express/pull/7050) | Improve test coverage for `res.set()` edge cases | Roadmap | Port upstream test-coverage PRs |
| [#7051](https://github.com/expressjs/express/pull/7051) | fix: make view engine extension matching case-insensitive | Roadmap | View engine extension matching ignores case |
| [#7059](https://github.com/expressjs/express/pull/7059) | refactor(deps): migrate connect-redis from v8 to v9 | Roadmap | Examples: fix security bugs and outdated dependencies |
| [#7061](https://github.com/expressjs/express/pull/7061) | refactor(deps): migrate express-session from v1.18.1 to v1.19.0 | Roadmap | Examples: fix security bugs and outdated dependencies |
| [#7092](https://github.com/expressjs/express/pull/7092) | fix: replace deprecated module.parent with require.main === module in… | Roadmap | Examples: fix security bugs and outdated dependencies |
| [#7113](https://github.com/expressjs/express/pull/7113) | Fix issue #5995, added cookie encryption | Won't do | Cookie encryption belongs in cookie-session or a dedicated package, not res.cookie. |
| [#7117](https://github.com/expressjs/express/pull/7117) | Fix query parameter truncation with configurable limit (fixes #5878) | Roadmap | Too many query parameters gives a 400 instead of dropping them |
| [#7119](https://github.com/expressjs/express/pull/7119) | clarify express-generator is still 4.x | Upstream process |  |
| [#7130](https://github.com/expressjs/express/pull/7130) | fix: handle BigInt status codes in res.status() and res.sendStatus() | Duplicate | of #6758 |
| [#7142](https://github.com/expressjs/express/pull/7142) | fix: add path containment check in View.prototype.lookup() | Won't do | View names are not user input; containment would break absolute view paths (working as designed). |
| [#7146](https://github.com/expressjs/express/pull/7146) | fix(res.set): remove implicit mime lookup and charset injection for Content-Type | Cherry-pick | Remove the `res.set` Content-Type magic |
| [#7151](https://github.com/expressjs/express/pull/7151) | fix: keep repeated extended query params as arrays beyond 20 values | Cherry-pick | Repeated query keys stay arrays up to the parameter limit |
| [#7161](https://github.com/expressjs/express/pull/7161) | fix: fall back to JSON when JSONP callback sanitizes to empty | Cherry-pick | A JSONP callback that sanitises to nothing gives broken JS |
| [#7275](https://github.com/expressjs/express/pull/7275) | feat: handle circular structure serialization | Won't do | Throwing on circular JSON is correct; custom handling goes through the json serializer setting. |
| [#7283](https://github.com/expressjs/express/pull/7283) | fix: remove implicit Content-Type magic in res.set (#7145) | Duplicate | of #7146 |
| [#7286](https://github.com/expressjs/express/pull/7286) | fix: normalize all-slash mount paths in app.use to '/' | Cherry-pick | A `//` mount also matches `/` |
| [#7317](https://github.com/expressjs/express/pull/7317) | fix: prevent host header injection by sanitizing userinfo in Host header | Cherry-pick | Userinfo in the Host header becomes `req.hostname` |
| [#7320](https://github.com/expressjs/express/pull/7320) | fix(res.links): skip empty-array rel values to prevent trailing comma in Link header | Cherry-pick | `res.links` with empty values |
| [#7330](https://github.com/expressjs/express/pull/7330) | fix(req): normalize forwarded protocol casing | Cherry-pick | Uppercase `X-Forwarded-Proto: HTTPS` is not secure |
| [#7331](https://github.com/expressjs/express/pull/7331) | fix(req): ignore trailing root dot in subdomains | Roadmap | `req.subdomains` ignores a trailing root dot |
| [#7332](https://github.com/expressjs/express/pull/7332) | fix(res.append): preserve empty header values | Roadmap | `res.append` keeps an existing empty header value |
| [#7338](https://github.com/expressjs/express/pull/7338) | │ feat(res): add res.sse() for Server-Sent Events | Won't do | SSE is a few lines with res.write; a helper belongs in a separate package. |
| [#7339](https://github.com/expressjs/express/pull/7339) | test: add unit tests for res.contentType alias and parameters in res.type | Roadmap | Port upstream test-coverage PRs |
| [#7351](https://github.com/expressjs/express/pull/7351) | fix(view): handle view names ending with "." to avoid require("") | Cherry-pick | A view name ending in `.` throws synchronously |
| [#7363](https://github.com/expressjs/express/pull/7363) | fix(res.send): handle raw ArrayBuffer as binary data | Cherry-pick | `res.send` corrupts ArrayBuffer, DataView and typed-array bodies |
| [#7369](https://github.com/expressjs/express/pull/7369) | docs: mention TypeScript generator options | Won't do | It points users to third-party starters; our types item brings its own docs. |
| [#7387](https://github.com/expressjs/express/pull/7387) | test: cover function-based "trust proxy" hop behavior | Cherry-pick | Numeric `trust proxy` throws at startup; X-Forwarded-Host/Proto use the trusted hop |
| [#7388](https://github.com/expressjs/express/pull/7388) | docs: fix typos in JSDoc comments | Roadmap | Fix JSDoc and README errors |
| [#7392](https://github.com/expressjs/express/pull/7392) | Fix view engine resolution for view names ending in a dot | Duplicate | of #7351 |
| [#7395](https://github.com/expressjs/express/pull/7395) | fix(req.get): perform case-insensitive header lookup | Won't do | Node documents headers as lowercase; Express shouldn't patch over code that breaks that (Won't do table). |
| [#7396](https://github.com/expressjs/express/pull/7396) | feat: add app-aware router creation | Roadmap | Decide and build sub-app settings inheritance |
| [#7407](https://github.com/expressjs/express/pull/7407) | fix(res.redirect): fallback to 'Redirecting' for non-standard status … | Roadmap | `res.redirect` body says `undefined` for non-standard status codes |
| [#7408](https://github.com/expressjs/express/pull/7408) | feat(res.send): add BigInt support | Won't do | BigInt status codes are invalid input and should fail, not be supported (Won't do table). |
| [#7410](https://github.com/expressjs/express/pull/7410) | fix: support raw ArrayBuffer in res.send (#7362) | Duplicate | of #7363 |
| [#7423](https://github.com/expressjs/express/pull/7423) | test: add test cases for null, string, and NaN status codes in res.sendStatus | Roadmap | Port upstream test-coverage PRs |
| [#7452](https://github.com/expressjs/express/pull/7452) | Make it clear what arguments `req.accepts*` functions accept | Roadmap | Fix JSDoc and README errors |
| [#7467](https://github.com/expressjs/express/pull/7467) | fix(res.sendFile): treat the app etag setting as a default, not an override | Cherry-pick | `sendFile` ignores a per-call `etag: false` |
| [#7470](https://github.com/expressjs/express/pull/7470) | docs: fix parameter name in req.acceptsLanguages JSDoc | Roadmap | Fix JSDoc and README errors |
| [#7479](https://github.com/expressjs/express/pull/7479) | fix: acceptParams truncates quoted values containing a semicolon | Cherry-pick | Quoted `;` in `acceptParams` |
| [#7481](https://github.com/expressjs/express/pull/7481) | perf: memoise the Content-Type resolution in res.set, res.type and setCharset | Cherry-pick | Memoise content-type lookups |
| [#7485](https://github.com/expressjs/express/pull/7485) | fix(res.send): add Content-Length only if Transfer-Encoding is not present | Already fixed | 4.x backport; master already has the fix as 18e5985b (#4893), see lib/response.js line 182. |
| [#7495](https://github.com/expressjs/express/pull/7495) | fix(security): Stored XSS in online example via unescaped User-Agent rendered into the visitor list | Roadmap | Examples: fix security bugs and outdated dependencies |
| [#7496](https://github.com/expressjs/express/pull/7496) | fix(security): Prototype-pollution write via __proto__ route param in route-separation user loader | Roadmap | Examples: fix security bugs and outdated dependencies |
| [#7501](https://github.com/expressjs/express/pull/7501) | fix(app.listen): remove the listen error handler after a successful start | Cherry-pick | `app.listen` leaves its error listener attached |
| [#7508](https://github.com/expressjs/express/pull/7508) | fix(res.redirect): avoid Content-Length with Transfer-Encoding | Cherry-pick | `res.redirect` sends Content-Length with Transfer-Encoding |
| [#7511](https://github.com/expressjs/express/pull/7511) | fix(res.send): preserve DataView byte ranges | Duplicate | of #7574 |
| [#7515](https://github.com/expressjs/express/pull/7515) | perf: skip content-type re-parse in setCharset for utf-8 | Roadmap | Re-review the other perf PRs against the bench |
| [#7516](https://github.com/expressjs/express/pull/7516) | perf: set default html and json content types directly | Cherry-pick | Write the default HTML and JSON content types directly |
| [#7517](https://github.com/expressjs/express/pull/7517) | perf: cache parsed req.query per request | Cherry-pick | `req.query` is cached per request, so changes to it stick |
| [#7519](https://github.com/expressjs/express/pull/7519) | perf: cache trust proxy lookups in req.ip, protocol and host | Cherry-pick | Cache the trust-proxy getters (`req.ip`, `protocol`, `host`, `hostname`), keyed on their inputs |
| [#7526](https://github.com/expressjs/express/pull/7526) | docs: fix req.query JSDoc return type | Roadmap | Fix JSDoc and README errors |
| [#7531](https://github.com/expressjs/express/pull/7531) | feat: add app.listRoutes with sub-application support | Cherry-pick | `app.listRoutes()` |
| [#7533](https://github.com/expressjs/express/pull/7533) | fix(req.subdomains): do not split IPv6 hosts that contain dots | Cherry-pick | `req.subdomains` splits IPv6 literals |
| [#7534](https://github.com/expressjs/express/pull/7534) | docs(res.sendFile): use res.status() in the example | Roadmap | Fix JSDoc and README errors |
| [#7539](https://github.com/expressjs/express/pull/7539) | docs: capitalize Express.js project name | Won't do | Cosmetic README wording with no user impact. |
| [#7541](https://github.com/expressjs/express/pull/7541) | fix(res.render): do not mutate the options object | Cherry-pick | `res.render` mutates the caller's options |
| [#7542](https://github.com/expressjs/express/pull/7542) | fix(response): send raw bytes of non-Uint8Array typed arrays in res.send() | Duplicate | of #7574 |
| [#7546](https://github.com/expressjs/express/pull/7546) | test: cover zero maxAge cookie expiry | Roadmap | Port upstream test-coverage PRs |
| [#7548](https://github.com/expressjs/express/pull/7548) | [TASK] Update to mocha 12.x | Duplicate | of #7557 |
| [#7549](https://github.com/expressjs/express/pull/7549) | [6.x] Default "env" to production and stop reading NODE_ENV | Cherry-pick | `env` defaults to production when `NODE_ENV` is unset, and we keep reading `NODE_ENV` |
| [#7550](https://github.com/expressjs/express/pull/7550) | [6.x] Remove body-parser re-exports | Won't do | They're the most-used Express APIs, and removing them gains users nothing (Won't do table). |
| [#7551](https://github.com/expressjs/express/pull/7551) | [6.x] Remove serve-static re-export | Won't do | They're the most-used Express APIs, and removing them gains users nothing (Won't do table). |
| [#7552](https://github.com/expressjs/express/pull/7552) | [6.x] Require Node.js 24 or higher | Roadmap | Support Node 22, 24 and 26 only: `engines` `>= 22`, CI matrix 22, 24 and 26 on Linux and Windows, remove the legacy (Node 16 and 17) workflow, and README and docs updated |
| [#7553](https://github.com/expressjs/express/pull/7553) | [6.x] res.send() no longer serializes non-string bodies as JSON | Roadmap | Deprecation warning for `res.send(object)` (it keeps working) |
| [#7554](https://github.com/expressjs/express/pull/7554) | [6.x] Remove the X-Powered-By header | Cherry-pick | Drop `X-Powered-By` |
| [#7555](https://github.com/expressjs/express/pull/7555) | perf: skip the req/res prototype switch for app.listen() | Cherry-pick | Skip the per-request prototype swap when `app.listen()` made the server |
| [#7557](https://github.com/expressjs/express/pull/7557) | deps: bump mocha to ^12 | Cherry-pick | Update mocha and supertest |
| [#7559](https://github.com/expressjs/express/pull/7559) | fix(res.render): forward send errors from the default callback to next | Cherry-pick | `res.render` after a send crashes the process |
| [#7561](https://github.com/expressjs/express/pull/7561) | honor sub-app routing settings inheritance | Cherry-pick | Decide and build sub-app settings inheritance |
| [#7572](https://github.com/expressjs/express/pull/7572) | test: cover unsatisfiable and invalid ranges in req.range | Roadmap | Port upstream test-coverage PRs |
| [#7573](https://github.com/expressjs/express/pull/7573) | ci: build with node v27 | Upstream process |  |
| [#7574](https://github.com/expressjs/express/pull/7574) | fix(res.send): preserve raw bytes of ArrayBuffer views | Cherry-pick | `res.send` corrupts ArrayBuffer, DataView and typed-array bodies |
| [#7578](https://github.com/expressjs/express/pull/7578) | fix(res.links): ignore empty object to prevent header corruption | Cherry-pick | `res.links` with empty values |
| [#7593](https://github.com/expressjs/express/pull/7593) | docs: use a cross-platform directory in the Quick Start example | Roadmap | Fix JSDoc and README errors |
| [#7600](https://github.com/expressjs/express/pull/7600) | build(deps-dev): bump supertest to ^7.3.2 | Cherry-pick | Update mocha and supertest |
| [#7603](https://github.com/expressjs/express/pull/7603) | Support request-aware JSON replacers | Roadmap | `json serializer` setting, so plugins can use fast-json-stringify |

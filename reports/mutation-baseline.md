# Mutation testing baseline

Stryker changes `lib/` one small piece at a time (a mutant), for example `<` to `<=`, or a string to `""`, and runs the tests that cover that line. A mutant is **killed** when a test fails, **timed out** when it makes the code loop forever (that counts as caught too), and **survived** when every test still passes. A survivor is either a missing assertion or an **equivalent** mutant, which can't change behaviour.

Score = (killed + timed out) / (killed + timed out + survived + no coverage). Runtime errors (a mutant that breaks loading the module) are not counted.

- Config: [`stryker.config.json`](../stryker.config.json). Workflow: [`.github/workflows/mutation.yml`](../.github/workflows/mutation.yml).
- Versions: `@stryker-mutator/core` 10.1.1 and `@stryker-mutator/mocha-runner` 10.1.1. The runner can't load mocha 12 yet (it requires mocha's cli files without the `.cjs` extension mocha 12 gave them: [stryker-js#6239](https://github.com/stryker-mutator/stryker-js/issues/6239), fix in [stryker-js#6205](https://github.com/stryker-mutator/stryker-js/pull/6205), not released). The workflow installs mocha 11.8.0 for the Stryker step only; the suite passes on both.
- The sandbox folder is `stryker-tmp`, not Stryker's default `.stryker-tmp`: `send` treats any path segment starting with a dot as a dotfile, so every `res.sendFile` test answered 404 inside a dot folder.
- Minimum score (`thresholds.break`): **92**, the baseline rounded down. A run below it fails.

## Baseline

First full run in CI: [run 44928953356](https://github.com/abedmurrar/express/actions/runs/44928953356), commit `1983e1e2`, Node 24 on `ubuntu-latest`, 12 minutes. That commit already had the `lib/utils.js` tests below.

| File | Score | Killed | Timed out | Survived | No coverage | Runtime errors | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| `lib/application.js` | 94.20% | 191 | 20 | 13 | 0 | 43 | 267 |
| `lib/express.js` | 100.00% | 4 | 10 | 0 | 0 | 2 | 16 |
| `lib/request.js` | 95.24% | 178 | 2 | 9 | 0 | 0 | 189 |
| `lib/response.js` | 95.64% | 491 | 57 | 25 | 0 | 1 | 574 |
| `lib/router/index.js` | 90.45% | 337 | 61 | 42 | 0 | 39 | 479 |
| `lib/router/lib/layer.js` | 96.64% | 125 | 19 | 5 | 0 | 7 | 156 |
| `lib/router/lib/route.js` | 95.07% | 124 | 11 | 7 | 0 | 11 | 153 |
| `lib/send/index.js` | 85.23% | 499 | 49 | 95 | 0 | 0 | 643 |
| `lib/utils.js` | 98.40% | 114 | 9 | 2 | 0 | 10 | 135 |
| `lib/view.js` | 92.11% | 66 | 4 | 6 | 0 | 0 | 76 |
| **All files** | **92.08%** | 2129 | 242 | 204 | 0 | 113 | 2688 |

No mutant lacks coverage, which matches the 100% coverage gate.

## Tests added for survivors

`lib/utils.js` was sampled locally first (`--mutate lib/utils.js --concurrency 2`): 88.80% with 14 survivors before the new tests, 97.60% with 3 after.

| Test | Mutants it kills |
|---|---|
| `test/utils.js`: `normalizeType` trims the type, parameter names and values; reads `q`; skips a parameter with no `=`; keeps an empty value | `lib/utils.js` lines 91, 100, 101, 105, 106, 108, 110, 114 (9 mutants; the line 114 one now loops forever, so it times out) |
| `test/req.query.js`: the extended parser keeps keys like `hasOwnProperty` and `toString` | `lib/utils.js` lines 269 and 270 (`allowPrototypes` removed or `false`) |
| `test/send/fork-additions.js`: send's own error page and directory redirect send the full HTML document, `Content-Type`, `Content-Security-Policy` and `X-Content-Type-Options` | `lib/send/index.js` lines 153, 165, 168, 368, 375 and the 11 strings of the HTML template (lines 821 to 834) |
| `test/send/fork-additions.js`: a fresh conditional GET answers 304 without content headers when the status is 200 or 304, and sends the file when it is 300 or 404 | `lib/send/index.js` lines 242, 244, 245 and the 7 mutants of `isCachable` (line 285) |
| `test/send/fork-additions.js`: `If-Match` matches a strong ETag in weak form and a weak one in strong form | `lib/send/index.js` line 218 (4 mutants) |
| `test/app.use.js`: `app.use('/')` throws exactly "app.use() requires a middleware function". The old test passed the text as `assert.throws`'s failure message, so it never checked the error message | `lib/application.js` line 214 |
| `test/res.status.js`: out-of-range codes give Express's own RangeError message (Node's message also starts with "Invalid status code"), and 100 is accepted | `lib/response.js` line 71 (2 mutants) |
| `test/app.render.js`: the lookup error names three directories, and a one-item array as a single directory | `lib/application.js` lines 557 and 558 (4 mutants) |
| `test/res.render.js`: the full "does not provide a view engine" message | `lib/view.js` line 82 |
| `test/req.protocol.js`: the first `X-Forwarded-Proto` value and a single value are trimmed | `lib/request.js` line 308 (2 mutants) |
| `test/req.hostname.js`: Host `[::]:3000` gives `[::]` | `lib/request.js` line 442 (`+ 1` to `- 1`) |
| `test/req.fresh.js`: `req.fresh` is false for POST and true for HEAD | `lib/request.js` line 463 (2 mutants) |
| `test/req.is.js`: types given as separate arguments | `lib/request.js` line 271 (2 mutants) |
| `test/app.options.js`: `Allow` is sorted, and a route without GET gets no automatic HEAD | `lib/router/index.js` line 707, `lib/router/lib/route.js` line 78 (2 mutants) |

## Equivalent mutants

These can't change what Express does, so they get a reason instead of a test.

| Where | Mutant | Reason |
|---|---|---|
| `lib/utils.js:93` | `index < length` to `<=` | When `index` equals `length`, `indexOf('=', length)` is -1 and the loop breaks at once. |
| `lib/utils.js:100` | `splitIndex > endIndex` to `>=` | An `=` and a `;` can't be at the same index, and `splitIndex` is always below `length`. |
| `lib/utils.js:39` | `{ weak: false }` to `{}` (survived locally, killed in CI by a timeout) | `etag` already makes strong ETags for strings and buffers when `weak` is not set. |
| 24 `debug(...)` strings: `lib/send/index.js` (17), `lib/application.js` (3), `lib/router/index.js` (3), `lib/view.js` (1) | message or namespace to `""` | Only changes `DEBUG` log text, never a response. |
| `lib/router/index.js:675`, `:739`, `lib/view.js:143` | `new Array(n)` to `new Array()` | Every slot is assigned by index right after, so the array ends up the same. |
| `lib/application.js:200`, `lib/router/index.js:368` | `arg.length !== 0` to `true` | For an empty array, `arg[0]` is `undefined`, which also ends the loop and takes the same "first argument is the path" branch. |
| `lib/router/lib/route.js:62` and `:63` (3 mutants) | HEAD-to-GET rename in `_handlesMethod` | The router lets HEAD through whatever `_handlesMethod` says (`router/index.js:269`), and `dispatch` does the same rename. |
| `lib/send/index.js:192`, `:499` | `isConditionalGET()` to `true` | Without conditional headers, `isPreconditionFailure()` and `isFresh()` are both false, so nothing changes. |
| `lib/send/index.js:95` | `Stream.call(this)` removed | `EventEmitter` creates its listener table on first use, so the stream behaves the same. |

## Follow-up work

The roadmap row stays in progress until every survivor has a test or a reason. Still open after this PR (counts from the baseline, less the ones above):

- `lib/send/index.js` (about 45): range handling (lines 513 to 571), extension and index lookups (591 to 642), stream cleanup on abort (668 to 678), header-already-set checks (724, 740), `collapseLeadingSlashes` (773, 779), `parseTokenList` (930 to 954), the `expose: false` option on errors (851), option defaults (115, 117), and the `extensions`/`index` option error message (901).
- `lib/router/index.js` (about 35): restoring `req.url` and `req.baseUrl` after a mounted router (196 to 226, 331), the sync-stack guard (213, 219), the fully qualified URL helper (486 to 507), `mergeParams` (533 to 563), param callbacks (615, 651), and argument copying (674, 742, 743).
- `lib/response.js` (about 23): `res.send` ETag and length branches (163, 180, 213), JSONP (295, 305), `sendFile` and `download` argument handling and aborts (421, 461, 938 to 990), `res.type` fallback (513), `res.format` key list (580), cookie `maxAge` (764, 766), `res.location` (824).
- `lib/application.js` (4): `app.listen` callback wrapping (600) and `logerror` (613, 615), which only logs outside the `test` environment.
- `lib/router/lib/layer.js` (5), `lib/router/lib/route.js` (2), `lib/view.js` (4), `lib/request.js` (2): mostly decode-error paths and `req.xhr`'s empty default.
- Once a fixed `@stryker-mutator/mocha-runner` is released and 7 days old, drop the mocha 11 step from the workflow.
- Raise `thresholds.break` as survivors are closed.

## Running it

The full run belongs in CI (Actions, "mutation", Run workflow). Locally, on one file and with few workers:

```sh
npm install --no-save mocha@11.8.0
npx stryker run --mutate lib/utils.js --concurrency 2
npm install   # back to mocha 12
```

Reports land in `reports/mutation/` (ignored by git); `reports/stryker-incremental.json` makes the next run skip unchanged mutants.

# Express: where users are really hurting

Snapshot taken 2026-11-21 against `master` at `43fca52d` (Express 5.3.0, router 2.2.0, Node 24.17.0 locally). The 6.x PRs #7549 to #7554 are left out on purpose: another agent is covering them.

## Method and counts

What was read, all from the dumps in `research/raw/`:

| Source | Count | How it was used |
|---|---|---|
| Open issues (`issues-open.json`) | 114 | Every one was read: its body, plus every comment from a maintainer or triager. Each was tagged with a theme and a kind (bug, design, feature, docs, support). |
| Open PRs (`prs-open.json` plus `threads/<n>.json` and `threads/<n>.review.json`) | 149 (143 analysed, 6 are 6.x) | Every one was read: its body, the files it changes, its review state and every maintainer comment. Each was classed as stalled-good, stalled, needs-work, abandoned, duplicate, cosmetic, rejected-direction or maintainer-owned. |
| GitHub Discussions (`discussions.jsonl`) | 208 (113 Q&A, 61 General, 18 Show and tell, 13 Ideas, 3 Archive) | Every one was read: its title, the start of its body and the maintainer replies. They were summarised by topic. |
| Closed issue titles (`issues-closed-titles.json`) | 3,973 | Keyword counts, used to spot duplicates. Closed items since 2025 were read by title. |
| `closed-targeted.jsonl` | 631 | Reaction and comment totals on the big closed threads (HTTP/2, promises, path-to-regexp). |
| perf-wg (75), security-wg (74), TC discussions (61), perf-wg#15 thread | 210 | Read for direction: what the maintainers are planning and what they are moving away from. |
| `gh pr view` / `gh pr checks` (read-only) | 23 PRs | Whether the PR can merge and whether CI ran on it. |

Who counts as a maintainer: the current team in `Readme.md` (wesleytodd, jonchurch, UlisesGascon, bjohansebas, blakeembrey, ctcpip, krzysdz, IamLizu, efekrskl, GroophyLifefor, Phillip9587, sheplu and others), plus emeritus members (dougwilson, hacksparrow, jonathanong and others) when they comment on old threads.

How pain was measured: reactions on the issue, comment count, duplicates among closed issues (keyword counts below), how many Discussions there are on the same topic, and how many people opened rival PRs for the same bug.

How repros were run: a tiny script per item in `research/repro/<number>.js`. Each requires `~/Dev/express` (master), makes the request with `node:http`, uses a port from 39201 to 39230 and always closes the server. They ran one at a time, because the benchmark from the other agent was busy on port 39181. Each script prints a `VERDICT:` line. One PR (#7574) was also tried against the repros, using a scratch copy of `lib/` outside the repo. After that, trying other PRs' code was blocked by the session's permission rules, so I did not run any more of them.

Headline counts:

- **Open issues:** 17 confirmed or claimed bugs, 9 disputed bug claims, 39 feature requests, 31 design debates, 6 docs, 4 deps, 2 types, 2 process and 4 plain support questions. 41 of the 114 are 10 or more years old. 35 were opened in 2025 or 2026.
- **PR review state:** 127 of 149 open PRs have no review decision. 15 have changes requested and only 6 are approved.
- **Silence:** 71 of the 99 PRs opened since June 2025 have no maintainer comment at all.
- **CI never ran:** first-time contributors' PRs show only the 2 Socket checks. For example, #7559, #7533, #7511, #7363 and #7351 show "2 pass", while #7508, #7541 and #7317 show the full 30-job matrix. So most bug-fix PRs from new contributors have never had the real test matrix run, because nobody approved the workflow.
- **What gets merged:** in 2026 almost everything merged was a dependency bump, a CVE bump, docs or CI. Only a handful of behaviour fixes landed: #7459 (ETag with Transfer-Encoding), #4893, #7366 and #7377 (QUERY method) and #7181 (4.x query arrays).
- **Duplicate PRs:** most open PRs from 2026 are rival fixes for the same few bugs. ArrayBuffer has 2 open plus 2 closed. Typed arrays and DataView have 3. A view name ending in `.` has 2 open plus 2 closed. The `res.set` Content-Type magic has 3. BigInt has 3. The perf micro-optimisations have 7. A triager called out "multiple LLM users and bots" on #7350.

Closed-issue keyword counts, as a rough duplicate signal (titles only, all time):

| Topic (regex on title) | Closed issues |
|---|---|
| render / view | 210 |
| sendFile / download / static | 199 |
| header | 120 |
| cookie | 83 |
| query / qs | 83 |
| params / mergeParams | 79 |
| redirect | 72 |
| async / promise / unhandled | 71 |
| res.send / sendStatus | 65 |
| path-to-regexp / wildcard / `*` | 54 (about 10 in 2025 alone, all "Missing parameter name") |
| error handling | 53 |
| security / CVE / XSS / traversal | 53 |
| OPTIONS / 405 | 43 |
| content-type / charset | 43 |
| TypeScript / types | 31 |
| ETag | 28 |
| perf / slow | 28 |
| trust proxy / X-Forwarded / req.ip / host | 21 |
| http2 | 14 (but #3390 has 43 reactions and #2761 has 39) |

## Repro results

All of these ran on master. A row marked "PR-only" is a bug that has a PR but no issue.

| Item | Claim | Script | Result |
|---|---|---|---|
| [#7362](https://github.com/expressjs/express/issues/7362) | `res.send(ArrayBuffer)` sends `{}` as JSON | `7362.js` | **reproduced**: 3 bytes came back as `"{}"` with `application/json` |
| [#7510](https://github.com/expressjs/express/issues/7510) | `res.send(DataView)` drops the bytes | `7510.js` | **reproduced**: 200, `Content-Length: 0`, empty body |
| [#7538](https://github.com/expressjs/express/issues/7538) | non-Uint8Array typed arrays corrupt or crash | `7538.js` | **reproduced**: with ETag on, `Uint16Array[0x0102,0x0304]` became 2 bytes `[2,4]`. With ETag off the request fails with a 500 `ERR_INVALID_ARG_TYPE` |
| [#7506](https://github.com/expressjs/express/issues/7506) | `res.redirect` sends Content-Length alongside Transfer-Encoding | `7506.js` | **reproduced**: Node's client rejects it with `Parse Error: Content-Length can't be present with Transfer-Encoding` |
| [#7532](https://github.com/expressjs/express/issues/7532) | `req.subdomains` splits IPv6 literals | `7532.js` | **reproduced**: `Host: [::ffff:127.0.0.1]` gives `["0","[::ffff:127"]` |
| [#7560](https://github.com/expressjs/express/issues/7560) | render after send throws an uncaught exception | `7560.js` | **reproduced**: an uncaught `ERR_HTTP_HEADERS_SENT`, and the error middleware is never called |
| [#7350](https://github.com/expressjs/express/issues/7350) | a view name ending in `.` throws an opaque TypeError | `7350.js` | **reproduced**: `app.render('index.', cb)` throws `ERR_INVALID_ARG_VALUE` synchronously and the callback never runs |
| [#7034](https://github.com/expressjs/express/issues/7034) | `res.set('Content-Type', unknown)` sends the header `false` | `7034.js` | **reproduced**: the header is the literal string `false` |
| [#5878](https://github.com/expressjs/express/issues/5878) | query params past 1000 are silently dropped | `5878.js` | **reproduced, and worse than reported**: both the `extended` parser and the default `simple` parser keep only 1000 of 1200 keys, with no error |
| [#7151](https://github.com/expressjs/express/pull/7151) (PR-only) | repeated keys past 20 become an object | `5878.js` | **reproduced** with the `extended` parser: 21 `ids=` values become an object, not an array |
| [#4557](https://github.com/expressjs/express/issues/4557) | `app.use('//', router)` also matches `/` | `4557.js` | **reproduced**: `GET /secret` is answered by the router mounted at `//`, not by the main app |
| [#2281](https://github.com/expressjs/express/issues/2281) | strict routing is ignored on a mount path | `2281.js` | **reproduced**: both `/strict` and `/strict/` return 200 with `strict: true` |
| [#4059](https://github.com/expressjs/express/issues/4059) | rewriting `req.url` in a mounted router loses a slash | `4059.js` | **reproduced**: `req.url` becomes `/appindex.html` |
| [#6809](https://github.com/expressjs/express/issues/6809) | router cycles hang | `6809.js` | **reproduced, but not as a hang**: there is no warning at startup, and every request gets a 500 `RangeError: Maximum call stack size exceeded` |
| [#5150](https://github.com/expressjs/express/issues/5150) | `res.cookie` adds Expires even with `expires: 0` | `5150.js` | **reproduced** |
| [#4750](https://github.com/expressjs/express/issues/4750) / [PR #7467](https://github.com/expressjs/express/pull/7467) | per-call `sendFile` etag option is overridden | `7467.js` | **reproduced**: `{ etag: false }` still sends an ETag. This is a regression from #6073, merged 2025-02-13 |
| [#4944](https://github.com/expressjs/express/issues/4944) | sending `/proc/*` files gives an empty body | `4944.js`, `4944-raw.js` | **reproduced**: `Content-Length: 0` and the file content is not sent (the cause is in the `send` module) |
| [#4298](https://github.com/expressjs/express/issues/4298) | `req.params` is gone after the `res.format` 406 | `4298.js` | **reproduced**: `req.params.id` is `undefined` in `finish`. This is probably router design: params are restored when `next(err)` leaves the route |
| [#2526](https://github.com/expressjs/express/issues/2526) | a route-level error handler is skipped | `2526.js` | **reproduced, but by design**: routes do not match while an error is pending |
| [PR #7317](https://github.com/expressjs/express/pull/7317) (PR-only) | userinfo in the Host header becomes the hostname | `7317.js` | **reproduced**: `Host: evil.example:x@good.example` gives `req.hostname === "evil.example"` |
| [PR #7330](https://github.com/expressjs/express/pull/7330) (PR-only) | `X-Forwarded-Proto: HTTPS` is not treated as secure | `7330.js` | **reproduced**: `protocol: "HTTPS"`, `secure: false` |
| [PR #7541](https://github.com/expressjs/express/pull/7541) (PR-only) | `res.render` mutates the caller's options | `7541.js` | **reproduced**: `_locals` is added to the shared object, and a frozen options object gives a 500 |
| [PR #7501](https://github.com/expressjs/express/pull/7501) (PR-only) | `app.listen` leaves its error listener attached | `7501.js`, `7501b.js` | **reproduced**: one leftover listener, so a later server `error` is silently swallowed |
| [PR #7161](https://github.com/expressjs/express/pull/7161) (PR-only) | a JSONP callback that sanitizes to nothing gives broken JS | `7161.js` | **reproduced**: the body is `/**/ typeof  === 'function' && ({"a":1});` |
| [#5626](https://github.com/expressjs/express/issues/5626) | OPTIONS + setHeader + json gives HEADERS_SENT | `5626.js` | **not reproduced** on master: 200 with the header and the body |
| [#7564](https://github.com/expressjs/express/issues/7564) | 4.x should require body-parser 1.20.9 | none (read `origin/4.x:package.json`) | **already fixed on the 4.x branch**: `"body-parser": "~1.20.9"` via #7565 (merged 2026-10-27). The issue is still open. I did not check whether a 4.x release has shipped it |

What did not run: the `res.links` empty-value PRs (#7320, #7578), BigInt status (#6756; a maintainer has already said it is not a crash), the quoted `;` in `acceptParams` (#7479), case-insensitive `req.get` (#7395), and any HTTP/2 test.

Tried against a PR: **#7574 fixes #7510 and #7538** (5 bytes and 4 bytes came back correctly) **but not #7362** (an ArrayBuffer still becomes `{}`). The other PRs were not run (see Method).

## Top 15 problems, ranked

The rank is pain times certainty: reactions, duplicates and discussion volume, weighed against whether the bug is reproduced or a maintainer has confirmed it. The "Contribution fit" note says how cheap and how welcome a fix would be. Those notes come from the maintainer signals further down.

### 1. No HTTP/2 support
- **Evidence:** this has the most reactions of any topic.
  - Open: [#5462](https://github.com/expressjs/express/issues/5462) (32 reactions), [#2781](https://github.com/expressjs/express/issues/2781), [#4959](https://github.com/expressjs/express/issues/4959), [#6863](https://github.com/expressjs/express/issues/6863).
  - The PR [#3730](https://github.com/expressjs/express/pull/3730) has 73 reactions and 58 comments. It has been open since 2018, targets the dead `5.0` branch and needs a rebase.
  - Closed: #3390 (43 reactions, 83 comments) and #2761 (39 reactions).
  - Discussions: [#6583](https://github.com/expressjs/express/discussions/6583), [#6755](https://github.com/expressjs/express/discussions/6755), [#6203](https://github.com/expressjs/express/discussions/6203).
  - Planning: TC backlog [discussions#407](https://github.com/expressjs/discussions/issues/407).
- **Kind:** missing feature. There is nothing to reproduce.
- **Maintainers:** in 2018 dougwilson said Node's compatibility API "is not transparent and still causes a lot of breakages", for example the colon headers in `req.headers`. In 2025 bjohansebas said the first step is tests for HTTP/2 in every direct dependency (TC [discussions#267](https://github.com/expressjs/discussions/issues/267)). It is listed for 6.x.
- **Contribution fit:** large. The maintainer-endorsed entry point is "HTTP/2 tests in each direct dependency", not reviving #3730.

### 2. Error handlers are detected by counting arguments
- **Evidence:** [#2896](https://github.com/expressjs/express/issues/2896) (70 reactions, 23 comments), [#3367](https://github.com/expressjs/express/issues/3367) (22 comments) and [D#5065](https://github.com/expressjs/express/discussions/5065). In practice: forget the unused `next` argument and the function silently stops being an error handler.
- **Kind:** design debate. There is nothing to reproduce.
- **Maintainers:** wesleytodd opened [pillarjs/router#59](https://github.com/pillarjs/router/pull/59) (an explicit `app.error`-style API). It has not moved since 2019.
- **Contribution fit:** low for a first PR. It needs the router, and a major version to remove arity detection.

### 3. Express 5 path syntax broke `*` and `?` routes
- **Evidence:**
  - Open: [#6711](https://github.com/expressjs/express/issues/6711) (9 reactions, 23 comments) and [#6724](https://github.com/expressjs/express/issues/6724), which a maintainer pinned.
  - Closed: #6428 (37 reactions, 34 comments), plus about 10 closed duplicates in 2025 (#6727, #6641, #6606, #6542, #6521, #6468, #6441, #6298, #6111).
  - Discussion [#6723](https://github.com/expressjs/express/discussions/6723) has 37 comments, and about 10 more Discussions ask the same thing (#6465, #6492, #6440, #6210, #5942, #6156, #5609, #5108).
- **Kind:** intended breaking change, but the biggest source of duplicates.
- **Maintainers:** it works as designed (see the migration guide). blakeembrey improved the message in `path-to-regexp@8.3.0` and asked users what message would have helped.
- **Contribution fit:** docs and error text only. Do not propose bringing back `*`.

### 4. Query parsing silently drops data, and the Express 5 query changes confuse users
- **Evidence:**
  - [#5878](https://github.com/expressjs/express/issues/5878): **reproduced**. Both parsers keep 1000 of 1200 keys and give no error. The PRs only target the extended parser.
  - [PR #7151](https://github.com/expressjs/express/pull/7151): **reproduced**. With the extended parser, more than 20 repeated keys become an object.
  - Express 5 confusion: [D#6245](https://github.com/expressjs/express/discussions/6245), [D#6490](https://github.com/expressjs/express/discussions/6490), [D#6637](https://github.com/expressjs/express/discussions/6637), [D#7179](https://github.com/expressjs/express/discussions/7179), and closed #7147, #7178, #6633, #6469 (`req.query` is now a getter and the default parser is now `simple`).
  - [D#5783](https://github.com/expressjs/express/discussions/5783) "Investigate replacing qs" (27 comments, plus closed #5723 with 21 reactions).
- **Open PRs:** [#7117](https://github.com/expressjs/express/pull/7117), [#5901](https://github.com/expressjs/express/pull/5901), [#7151](https://github.com/expressjs/express/pull/7151), [#6865](https://github.com/expressjs/express/pull/6865).
- **Maintainers:** TC [discussions#511](https://github.com/expressjs/discussions/issues/511) wants to "stop being opinionated about parsers". jonchurch on #7151: "we want to move away from passing qs options in favor of folks configuring their own parsers". krzysdz: any new limit should keep 1000 as its default.
- **Contribution fit:** medium. Raising an error or a 4xx instead of truncating silently is not built, and it fits that direction. Adding more qs knobs does not.

### 5. Strict routing and mount-path bugs in the router
- **Evidence:** all four are **reproduced**:
  - [#2281](https://github.com/expressjs/express/issues/2281) (14 reactions, 33 comments, 12 years old)
  - [#3798](https://github.com/expressjs/express/issues/3798)
  - [#4557](https://github.com/expressjs/express/issues/4557)
  - [#4059](https://github.com/expressjs/express/issues/4059)
- **Maintainers:** on #4557 in 2021, dougwilson said it could "probably fix it within the 5.x series".
- **Open PRs:** the fixes live in pillarjs/router: [router#190](https://github.com/pillarjs/router/pull/190) and [router#206](https://github.com/pillarjs/router/pull/206), both open. A commenter says they get no maintainer response. The Express-side workaround is [PR #7286](https://github.com/expressjs/express/pull/7286) (normalise `//`).
- **Contribution fit:** medium. The work is in the router repo, with an Express bump afterwards. Strictness changes can break apps, so they need an opt-in or a major version.

### 6. TypeScript types live outside the repo and drift
- **Evidence:**
  - Issues: [#2818](https://github.com/expressjs/express/issues/2818) (12 reactions, 34 comments), [#6370](https://github.com/expressjs/express/issues/6370) (13 comments), [#6385](https://github.com/expressjs/express/issues/6385), [#7231](https://github.com/expressjs/express/issues/7231).
  - PR [#6382](https://github.com/expressjs/express/pull/6382) (8 reactions).
  - About 14 Discussions: #6529 (5 upvotes), #5988, #6455, #6358, #7001, #6168, #6164, #5937, #5897, #5146, #5023, #6600, #6305, #7294.
  - Closed: #7457, #6311, #6267, #7000.
- **Maintainers:** "there's no consensus yet on migrating to TypeScript" (bjohansebas). The types are in DefinitelyTyped and the TS working group decides.
- **Contribution fit:** low here. Fixes belong in DefinitelyTyped.

### 7. No supported way to list or introspect routes
- **Evidence:** [D#5961](https://github.com/expressjs/express/discussions/5961) (9 upvotes, v5 broke the old `layer.regexp` hack), [D#5858](https://github.com/expressjs/express/discussions/5858) (31 comments), [#4523](https://github.com/expressjs/express/issues/4523), [#2501](https://github.com/expressjs/express/issues/2501) (30 comments), [#2739](https://github.com/expressjs/express/issues/2739), [D#4987](https://github.com/expressjs/express/discussions/4987), [D#6767](https://github.com/expressjs/express/discussions/6767).
- **Open PR:** a maintainer opened [PR #7531](https://github.com/expressjs/express/pull/7531) (`app.listRoutes`). It depends on [pillarjs/router#174](https://github.com/pillarjs/router/pull/174).
- **Contribution fit:** good as review and testing of #7531 and router#174. Do not open a rival PR.

### 8. `res.send` corrupts binary bodies
- **Evidence:** all three are **reproduced**:
  - [#7362](https://github.com/expressjs/express/issues/7362) (ArrayBuffer becomes `{}`)
  - [#7510](https://github.com/expressjs/express/issues/7510) (DataView becomes empty)
  - [#7538](https://github.com/expressjs/express/issues/7538) (Uint16Array gives truncated bytes or a 500)
- **Root cause:** one function. An `ArrayBuffer` falls into `this.json()`. `Buffer.from(view)` copies element by element. `res.end()` rejects views that are not Uint8Array.
- **Pain:** low reactions, but this is silent data corruption, and seven people opened PRs: [#7363](https://github.com/expressjs/express/pull/7363), [#7410](https://github.com/expressjs/express/pull/7410) (conflicting), [#7511](https://github.com/expressjs/express/pull/7511), [#7542](https://github.com/expressjs/express/pull/7542), [#7574](https://github.com/expressjs/express/pull/7574), plus closed #7419 and #7453.
- **Open PRs:** #7574 is verified here to fix two of the three. None of these PRs has a review, and none has had full CI.
- **Contribution fit:** **excellent.** One small change in `lib/response.js` with tests covers all three. Credit the existing PRs.

### 9. Response helpers emit wrong headers
- **Evidence:** all **reproduced**:

  | Bug | Open PR | Notes |
  |---|---|---|
  | [#7506](https://github.com/expressjs/express/issues/7506): `res.redirect` sends Content-Length with Transfer-Encoding | [PR #7508](https://github.com/expressjs/express/pull/7508) | 22 lines, full CI green. Mirrors the `res.send` fix #4893 that already landed |
  | [#7034](https://github.com/expressjs/express/issues/7034): Content-Type becomes `false` | [PR #7035](https://github.com/expressjs/express/pull/7035) | Safe for 5.x. #7146 and #7283 remove the magic altogether and are for 6.x, see [#7145](https://github.com/expressjs/express/issues/7145). blakeembrey thinks it should throw |
  | [#5150](https://github.com/expressjs/express/issues/5150): `res.cookie` adds Expires despite `expires: 0` | [PR #5151](https://github.com/expressjs/express/pull/5151) | 3 lines, no test, unreviewed since 2023 |
  | `sendFile` ignores a per-call `etag: false` | [PR #7467](https://github.com/expressjs/express/pull/7467) | Regression from #6073. krzysdz has already suggested `??=` |
  | JSONP with an empty callback gives broken JS | [PR #7161](https://github.com/expressjs/express/pull/7161) | |

- **Contribution fit:** **excellent.** Each is a 3 to 35 line change on an existing PR. Reviewing, testing and rebasing them is the cheapest real win in the repo.

### 10. Host and proxy header parsing is loose
- **Evidence:**

  | Bug | Repro | Open PR | Notes |
  |---|---|---|---|
  | [PR #7317](https://github.com/expressjs/express/pull/7317): userinfo in the Host header becomes `req.hostname` | **reproduced** | [#7317](https://github.com/expressjs/express/pull/7317) | Opened by bjohansebas, on the TC agenda, full CI green. jonchurch asked why userinfo is sanitised while a bad port is rejected |
  | [#7532](https://github.com/expressjs/express/issues/7532): IPv6 literals split into subdomains | **reproduced** | [#7533](https://github.com/expressjs/express/pull/7533) | |
  | Uppercase `X-Forwarded-Proto` is not treated as secure | **reproduced** | [#7330](https://github.com/expressjs/express/pull/7330) | Labelled 6.x |
  | [#6541](https://github.com/expressjs/express/issues/6541): trust proxy callback runs once per hop | | [#7387](https://github.com/expressjs/express/pull/7387) adds tests | By design (dougwilson) |
  | [#7427](https://github.com/expressjs/express/issues/7427): `router.use(subapp)` keeps the wrong trust policy | | | Triager: expected, because `router.use` is not `app.use` |

  Past advisories in this area: GHSA-rv95-896h-c2vc (open redirect) and GHSA-qw6h-vgh9-j6wx (XSS via redirect).
- **Contribution fit:** good for #7533, plus security-sensitive review of #7317. Let the TC lead.

### 11. `res.render` failure paths crash or mislead
- **Evidence:** all **reproduced**:
  - [#7560](https://github.com/expressjs/express/issues/7560): an uncaught exception after a send, which takes the process down. The PR is [#7559](https://github.com/expressjs/express/pull/7559) (32 lines; only Socket CI has run).
  - [#7350](https://github.com/expressjs/express/issues/7350): a synchronous `require("")` throw. The PRs are [#7351](https://github.com/expressjs/express/pull/7351) and the duplicate [#7392](https://github.com/expressjs/express/pull/7392). krzysdz argues the right behaviour is not settled: `index.` is a valid file name.
  - [PR #7541](https://github.com/expressjs/express/pull/7541): `render` mutates the caller's options (21 lines, full CI green).
- **Contribution fit:** good. #7559 and #7541 are small and correct-looking. #7350 needs a behaviour decision first.

### 12. Performance
- **Evidence:**
  - Discussions: [D#6500](https://github.com/expressjs/express/discussions/6500) (8 upvotes, slower on Node 22), [D#6362](https://github.com/expressjs/express/discussions/6362), [perf-wg#15](https://github.com/expressjs/perf-wg/issues/15) "How to make Express 2x faster" (long thread, where only one triager, IamLizu, replied).
  - Issues: [#5906](https://github.com/expressjs/express/issues/5906), [#2472](https://github.com/expressjs/express/issues/2472).
  - Seven unreviewed perf PRs: [#7008](https://github.com/expressjs/express/pull/7008), [#7481](https://github.com/expressjs/express/pull/7481), [#7515](https://github.com/expressjs/express/pull/7515), [#7516](https://github.com/expressjs/express/pull/7516), [#7517](https://github.com/expressjs/express/pull/7517), [#7519](https://github.com/expressjs/express/pull/7519), [#7555](https://github.com/expressjs/express/pull/7555) (draft; it claims the prototype switch costs about 2.4 µs per request, which I did not measure). [#6994](https://github.com/expressjs/express/pull/6994) has changes requested.
- **Maintainers:** on #7008 bjohansebas wrote: "if you're going to submit PRs that claim performance improvements, please share what improvements you actually observed". perf-wg is building CI measurement ([perf-wg#131](https://github.com/expressjs/perf-wg/issues/131)).
- **Contribution fit:** only with before-and-after numbers from the perf-wg tooling. The benchmark agent is covering this.

### 13. Dependency and supply-chain churn
- **Evidence:**
  - qs CVE bumps keep arriving: closed #6216, #6968, #6977, #7304, #7439, #7143, and merged #7057, #7305, #7440, #7478.
  - Open: [#6647](https://github.com/expressjs/express/issues/6647) (duplicate versions in the graph), [#7502](https://github.com/expressjs/express/issues/7502) (maintainer audit), [#7547](https://github.com/expressjs/express/issues/7547) (mocha 12).
  - [#7564](https://github.com/expressjs/express/issues/7564) is already fixed on 4.x.
  - [PR #6865](https://github.com/expressjs/express/pull/6865) removes the direct `qs` dependency (4 reactions, labelled 6.x).
  - Planning: TC [discussions#459](https://github.com/expressjs/discussions/issues/459) (replace `depd` and `debug` with Node built-ins) and [discussions#511](https://github.com/expressjs/discussions/issues/511).
- **Contribution fit:** medium. Ask for #7564 to be closed. #6865 matches where the TC is heading, but it is a 6.x item.

### 14. Async and error-handling ergonomics
- **Evidence:**
  - [#2263](https://github.com/expressjs/express/issues/2263): the default handler `console.error`s 4xx errors (17 comments).
  - [#6951](https://github.com/expressjs/express/issues/6951) (6 reactions), with [PR #6982](https://github.com/expressjs/express/pull/6982) for stable error codes. UlisesGascon pushed commits to it in 2026-10.
  - [#4186](https://github.com/expressjs/express/issues/4186) and [#5249](https://github.com/expressjs/express/issues/5249).
  - Discussions [D#7359](https://github.com/expressjs/express/discussions/7359), [D#5111](https://github.com/expressjs/express/discussions/5111), [D#6493](https://github.com/expressjs/express/discussions/6493).
  - Closed #2259 "promises" (54 reactions). Express 5 has fixed most of this.
- **Contribution fit:** good as review of #6982, which the maintainers want. jonchurch said #6951 is "in the discussion phase… not planning on assigning it to anyone outside the core team".

### 15. Small confirmed lifecycle bugs
- **Evidence:** all four reproduce, but each has a catch:

  | Bug | Repro | Catch |
  |---|---|---|
  | [PR #7501](https://github.com/expressjs/express/pull/7501): `app.listen` swallows later server errors | **reproduced** | The PR fails the Node 16 and 17 CI jobs |
  | [#6809](https://github.com/expressjs/express/issues/6809): router cycle | **reproduced** as a `RangeError` 500, not a hang | The fix is [router#183](https://github.com/pillarjs/router/pull/183) |
  | [#4944](https://github.com/expressjs/express/issues/4944): `/proc` files | **reproduced** | The cause is in the `send` module |
  | [#4298](https://github.com/expressjs/express/issues/4298): `req.params` is lost after a 406 | **reproduced** | Probably router design |

- **Contribution fit:** mixed. #7501 is the cheapest: fix its CI.

## Stalled good PRs (cheap wins)

"Stalled good" means four things: the bug reproduces on master, the change is small, nobody has objected, and it can merge (`gh pr view`: MERGEABLE, blocked only on review). Ordered by value per line changed:

| PR | Fixes | Size | CI | Why it is stuck | What would unblock it |
|---|---|---|---|---|---|
| [#7508](https://github.com/expressjs/express/pull/7508) | #7506 Content-Length + TE in redirect | +22/-1 | full matrix, green | no reviewer | a review; it mirrors the already-merged #4893 |
| [#7541](https://github.com/expressjs/express/pull/7541) | `res.render` options mutation | +21/-2 | full matrix, green | krzysdz's test nits | apply the 2 suggestions |
| [#7559](https://github.com/expressjs/express/pull/7559) | #7560 render crash | +32/-1 | Socket only | CI never approved | approve the workflow, then review |
| [#7574](https://github.com/expressjs/express/pull/7574) | #7510 and #7538 (verified here) | +129/-0 | Socket only | 3 rival PRs | pick it, add ArrayBuffer (#7363) or merge both, close #7511, #7542 and #7410 |
| [#7363](https://github.com/expressjs/express/pull/7363) | #7362 ArrayBuffer | +120/-0 | Socket only | rival #7410 | as above |
| [#7533](https://github.com/expressjs/express/pull/7533) | #7532 IPv6 subdomains | +33/-1 | Socket only | none | approve CI and review; a community member has already tested it |
| [#7467](https://github.com/expressjs/express/pull/7467) | sendFile etag regression | +35/-1 | Socket only | krzysdz nits (`??=`) | apply the nits |
| [#7035](https://github.com/expressjs/express/pull/7035) | #7034 Content-Type `false` | +15/-1 | Socket only | the "throw or not" debate | decide 5.x behaviour (keep the original value) vs 6.x (#7146) |
| [#7161](https://github.com/expressjs/express/pull/7161) | JSONP empty callback | +21/-3 | Socket only | no reviewer | a review |
| [#5151](https://github.com/expressjs/express/pull/5151) | #5150 cookie Expires | +3/-1 | none | no test, 3 years old | add a test |
| [#7286](https://github.com/expressjs/express/pull/7286) | #4557 `//` mount | +47/-0 | Socket only | the real fix belongs in the router | decide here or in router#190 |
| [#7351](https://github.com/expressjs/express/pull/7351) | #7350 view name `.` | +23/-0 | Socket only | behaviour debate (krzysdz) | decision on the expected behaviour, close dup #7392 |
| [#7388](https://github.com/expressjs/express/pull/7388) | JSDoc typos | +2/-2 | Socket only | approved 2026-09, not merged | merge |
| [#2653](https://github.com/expressjs/express/pull/2653) | async view lookup (no sync I/O after startup) | +548/-54 | full matrix (old) | approved, reworked by bjohansebas 2026-07, now **conflicting** | rebase |

Maintainer-owned PRs that are worth helping test rather than duplicating: [#7317](https://github.com/expressjs/express/pull/7317) (Host userinfo), [#7531](https://github.com/expressjs/express/pull/7531) (listRoutes), [#6982](https://github.com/expressjs/express/pull/6982) (error codes), [#7600](https://github.com/expressjs/express/pull/7600) (supertest 7.3.2, which supersedes [#6856](https://github.com/expressjs/express/pull/6856)) and [#3714](https://github.com/expressjs/express/pull/3714) (settings).

Abandoned (no author activity for years, conflicting, or on the dead `5.0` base): #2738, #2935, #3114, #3427, #3538, #3613, #3981, #4044, #4680, #4794, #4942, #4946, #4958 and #5225. The PRs [#3569](https://github.com/expressjs/express/pull/3569) (multi-engine lookup, Wes +1) and [#5007](https://github.com/expressjs/express/pull/5007) (app `merge params`) are stalled rather than dead.

Duplicates that should be closed in favour of one PR: #7410 and #7363; #7511, #7542 and #7574; #7392 and #7351; #7283 and #7146; #7130 and #6758; #7548 and #7557; #7539 is identical to the already-closed #7528.

## Things maintainers reject

These are the patterns to avoid proposing again, each with where it was said:

1. **Magic properties, strings and overloads.**
   - "adding a magical property to `res` is not what we want" (dougwilson, [#2422](https://github.com/expressjs/express/pull/2422)).
   - "we had wanted to move away from the 'magic strings'" (wesleytodd, [#3770](https://github.com/expressjs/express/pull/3770) `next('last')`).
   - The 6.x plan removes `res.set` Content-Type magic ([#7145](https://github.com/expressjs/express/issues/7145)) and the `res.send(obj)` JSON overload ([#2249](https://github.com/expressjs/express/issues/2249)).
   - wesleytodd on [#3714](https://github.com/expressjs/express/pull/3714): "load bearing method overloading, arity checks and prototypical inheritance".
2. **New configuration settings.**
   - blakeembrey on [#5856](https://github.com/expressjs/express/pull/5856): "I'd prefer no configuration".
   - wesleytodd: "we should actually be deprecating and removing configuration instead of adding more".
   - Strict status codes stay loose by default ([#5623](https://github.com/expressjs/express/issues/5623)).
   - Do not propose new `app.set(...)` knobs, including more qs options (jonchurch on [#7151](https://github.com/expressjs/express/pull/7151), TC [discussions#511](https://github.com/expressjs/discussions/issues/511)).
3. **Scope creep into core. "Make it a middleware or a separate package."**
   - SSE ([#7334](https://github.com/expressjs/express/issues/7334), UlisesGascon). bjohansebas is more open to it, citing Hono.
   - Swagger/OpenAPI ([D#6303](https://github.com/expressjs/express/discussions/6303)).
   - A security bundle ([D#4571](https://github.com/expressjs/express/discussions/4571)).
   - Pre-send response hooks ([#3945](https://github.com/expressjs/express/issues/3945)).
   - View composers ([#2907](https://github.com/expressjs/express/issues/2907)).
   - `route().use()` ([#1980](https://github.com/expressjs/express/issues/1980)).
   - 405 handling ([#2414](https://github.com/expressjs/express/issues/2414)).
   - A DDoS cache ([#6395](https://github.com/expressjs/express/issues/6395)).
   - Logging is the exception: wesleytodd wants it in core in a future major, through `pino` or a Node core logger ([D#5857](https://github.com/expressjs/express/discussions/5857), TC [discussions#459](https://github.com/expressjs/discussions/issues/459)).
4. **Supporting odd inputs instead of validating them.**
   - "We're not going to add bigint support for sending the status" (bjohansebas, [#6756](https://github.com/expressjs/express/issues/6756)). So [#7408](https://github.com/expressjs/express/pull/7408) (BigInt in `res.send`) goes against this.
   - jonchurch: the status error is "not an uncaught exception… very low prio".
5. **Fixing things Express doesn't own.**
   - ETag varying by CORS origin ([#5986](https://github.com/expressjs/express/issues/5986), [#6884](https://github.com/expressjs/express/pull/6884)): "this is not an Express bug".
   - Case-insensitive `req.get` for hand-mutated `req.headers` ([#7395](https://github.com/expressjs/express/pull/7395)): it "violates" Node's documented contract, so it is parked as a 6.x idea.
   - View path containment ([#7140](https://github.com/expressjs/express/issues/7140), [#7142](https://github.com/expressjs/express/pull/7142)): "working as designed", and "DO NOT EVER PASS USER INPUT AS THE VIEW NAME" (krzysdz on #7350).
   - `router.use(subapp)` ([#7427](https://github.com/expressjs/express/issues/7427)): expected.
   - Types belong in DefinitelyTyped ([D#7001](https://github.com/expressjs/express/discussions/7001), [D#5023](https://github.com/expressjs/express/discussions/5023)).
6. **Breaking changes in a minor release.** Deprecate first, remove in the next major (wesleytodd on [#3951](https://github.com/expressjs/express/issues/3951), bjohansebas on [#6404](https://github.com/expressjs/express/pull/6404) and [#6941](https://github.com/expressjs/express/issues/6941)). Changing `req.query` back to writable, or bringing back `*`, is off the table.
7. **Cosmetic refactors.** Converting `var` to `const` and `arguments` to spread syntax. wesleytodd: "seems like a stylistic one" ([#6126](https://github.com/expressjs/express/pull/6126)). krzysdz on [D#6449](https://github.com/expressjs/express/discussions/6449): "Such rewrite would be just a cosmetic change". Seven open PRs of this kind are sitting idle.
8. **Performance claims without numbers.** bjohansebas on [#7008](https://github.com/expressjs/express/pull/7008).
9. **Bulk tooling changes made in place.** The ESLint 9 upgrade and husky ([#6118](https://github.com/expressjs/express/pull/6118), [#6912](https://github.com/expressjs/express/pull/6912), [#6480](https://github.com/expressjs/express/pull/6480)) wait on a linter decision ([discussions#327](https://github.com/expressjs/discussions/issues/327)). Bundling several dependency bumps in one PR is rejected; they want one PR per dependency ([#6113](https://github.com/expressjs/express/pull/6113)).
10. **Examples that pull in third-party packages.** wesleytodd would rather delete them, because they are "a great target for a malicious attacker" ([#6153](https://github.com/expressjs/express/pull/6153)). The examples are meant to move to their own repo ([#5309](https://github.com/expressjs/express/issues/5309)).
11. **LLM-flavoured PRs.**
   - Triagers push back on verbose comments ("not every line of code needs 3 lines of comments", krzysdz on [#7467](https://github.com/expressjs/express/pull/7467)).
   - They push back on duplicate bot PRs ([#7350](https://github.com/expressjs/express/issues/7350)).
   - They push back on self-fulfilling tests (wesleytodd on [#6306](https://github.com/expressjs/express/pull/6306)).
   - Disclose any AI assistance, keep diffs minimal, and write tests that fail before the fix.
12. **Governance and process docs in this repo.** These go to `expressjs/discussions` instead ([#5503](https://github.com/expressjs/express/pull/5503), [#6412](https://github.com/expressjs/express/pull/6412)).

## Noise

Support questions and other non-actionable items. They need no code, but they do show where the docs fail:

- **Issues that are really support questions:**
  - Network or firewall problems: [#5008](https://github.com/expressjs/express/issues/5008).
  - Long polling: [#4889](https://github.com/expressjs/express/issues/4889).
  - Cookies on Vercel and Render: [#6926](https://github.com/expressjs/express/issues/6926).
  - "How do I use http2": [#6863](https://github.com/expressjs/express/issues/6863).
  - [#5626](https://github.com/expressjs/express/issues/5626) does not reproduce on master and is a candidate to close.
  - [#6579](https://github.com/expressjs/express/issues/6579) has no repro, and the maintainer asked for one in 2025-07.
- **Discussions, by topic:**

  | Topic | About how many | Examples | What it tells us |
  |---|---|---|---|
  | Cookies and CORS on a hosted deploy (mostly Render with a Vercel frontend) | 9 | [D#5423](https://github.com/expressjs/express/discussions/5423) (22 comments, 8 upvotes), #6262, #6394, #5850, #5075, #4848, #5700, #5852 | wesleytodd: "ask vercel… This forum is run by unpaid volunteers". A docs page on SameSite and secure cookies behind proxies would deflect these |
  | Express 5 path syntax | about 11 | | see problem 3 |
  | TypeScript | about 14 | | see problem 6 |
  | Route listing | 7 | | see problem 7 |
  | `req.query` in v5 | 4 | | see problem 4 |
  | Async and error handling how-to | about 6 | | |
  | Streaming, SSE and video | 4 | #6686, #6687, #5770, #7280 | |
  | CSRF after `csurf` was deprecated | 2 | [D#5491](https://github.com/expressjs/express/discussions/5491) (9 upvotes), #6704 | a real gap: there is no maintained first-party CSRF middleware |
  | Governance, community and "is it maintained?" | about 23 | | |
  | Show and tell, promotion and spam | about 26 | | |
  | General how-to Q&A | the rest | | |

## Themes

Every open issue appears below at least once. One issue can sit in more than one theme. "Kind" is my classification: bug (reproduced or confirmed), bug-claim (disputed, by design, or no repro), design, feature, docs, deps, types or support. Each table is sorted by reactions, then comments. The PR column lists open PRs (or router PRs) that target the issue.

### Routing and the router

32 open issues, 6 open PRs. Total reactions on the issues: 41; total comments: 313.

| Issue | Title | Reactions | Comments | Age | Kind | Open PR that fixes it | Repro on master |
|---|---|---|---|---|---|---|---|
| [#2281](https://github.com/expressjs/express/issues/2281) | '/' route breaks strict routing | 14 | 33 | 12 y | bug | router (none) | reproduced |
| [#6711](https://github.com/expressjs/express/issues/6711) | Restore Support for app.all('*') Wildcard in Express v5 | 9 | 23 | 15 mo | design | - | - |
| [#2501](https://github.com/expressjs/express/issues/2501) | Add originalRoute like originalUrl | 5 | 30 | 12 y | feature | [router#34](https://github.com/pillarjs/router/pull/34) | - |
| [#4523](https://github.com/expressjs/express/issues/4523) | Router events (enabling route documentation) – feature request | 5 | 3 | 6 y | feature | [#7531](https://github.com/expressjs/express/pull/7531) | - |
| [#2246](https://github.com/expressjs/express/issues/2246) | Make automatic OPTIONS responses configurable | 3 | 5 | 12 y | design | - | - |
| [#3379](https://github.com/expressjs/express/issues/3379) | Allow for multiple parameter names in router.param() | 2 | 6 | 9 y | feature | - | - |
| [#2511](https://github.com/expressjs/express/issues/2511) | Reject routes containing an unescaped space character | 1 | 10 | 12 y | feature | - | - |
| [#5006](https://github.com/expressjs/express/issues/5006) | Router mergerParams setting on app initialization | 1 | 3 | 4 y | feature | [#5007](https://github.com/expressjs/express/pull/5007) | - |
| [#6809](https://github.com/expressjs/express/issues/6809) | Router cycles cause silent runtime hangs | 1 | 3 | 13 mo | bug | [router#183](https://github.com/pillarjs/router/pull/183) | reproduced (500 RangeError, not a hang) |
| [#2151](https://github.com/expressjs/express/issues/2151) | Params registered on app available in routers used by app | 0 | 34 | 13 y | feature | - | - |
| [#1980](https://github.com/expressjs/express/issues/1980) | Please add app.route('foo').use() | 0 | 31 | 13 y | feature | - | - |
| [#2414](https://github.com/expressjs/express/issues/2414) | route() should handle 405 Method not allowed | 0 | 21 | 12 y | feature | - | - |
| [#2878](https://github.com/expressjs/express/issues/2878) | Support for auto-generated Accept-Patch header | 0 | 13 | 11 y | feature | - | - |
| [#2247](https://github.com/expressjs/express/issues/2247) | Make automatic HEAD -> GET configurable | 0 | 10 | 12 y | design | - | - |
| [#4298](https://github.com/expressjs/express/issues/4298) | req.params undefined with unspecified res.format default | 0 | 10 | 7 y | bug | - | reproduced (likely router design) |
| [#2739](https://github.com/expressjs/express/issues/2739) | Question: Is there a way to identify a route and create href link to it? | 0 | 9 | 11 y | feature | - | - |
| [#3798](https://github.com/expressjs/express/issues/3798) | Strict Routing | 0 | 8 | 8 y | bug | router (none) | - |
| [#4557](https://github.com/expressjs/express/issues/4557) | 'App.use(path, ...)' Does Not Mount at ''//'' | 0 | 7 | 6 y | bug | [#7286](https://github.com/expressjs/express/pull/7286), [router#190](https://github.com/pillarjs/router/pull/190) | reproduced |
| [#2483](https://github.com/expressjs/express/issues/2483) | Route param error handle | 0 | 6 | 12 y | bug-claim | - | - |
| [#2524](https://github.com/expressjs/express/issues/2524) | Add "set" Method to "Router" | 0 | 6 | 12 y | feature | - | - |
| [#2552](https://github.com/expressjs/express/issues/2552) | Fix setting inheritance | 0 | 6 | 12 y | design | [#7561](https://github.com/expressjs/express/pull/7561) | - |
| [#2563](https://github.com/expressjs/express/issues/2563) | Simplify app.all and app.VERB | 0 | 6 | 12 y | design | - | - |
| [#2756](https://github.com/expressjs/express/issues/2756) | feat: Support typed params in routes | 0 | 6 | 11 y | feature | - | - |
| [#2564](https://github.com/expressjs/express/issues/2564) | Shouldn't app.set("case sensitive routing") propagate to new Routers? | 0 | 5 | 12 y | feature | [#7396](https://github.com/expressjs/express/pull/7396) | - |
| [#4059](https://github.com/expressjs/express/issues/4059) | Rewriting req.url in router with prefix path results in missing slash (/) | 0 | 5 | 7 y | bug | [router#206](https://github.com/pillarjs/router/pull/206) | reproduced |
| [#3057](https://github.com/expressjs/express/issues/3057) | app.locals not passed down to a subapp | 0 | 4 | 10 y | design | - | - |
| [#2526](https://github.com/expressjs/express/issues/2526) | path specific error handler not called | 0 | 3 | 12 y | bug-claim | - | reproduced (by design) |
| [#2603](https://github.com/expressjs/express/issues/2603) | Multiple callbacks on app.param. Eg: app.param('resource', cb1, cb2) | 0 | 2 | 12 y | feature | - | - |
| [#5004](https://github.com/expressjs/express/issues/5004) | Issue a warning when GET route declared before HEAD | 0 | 2 | 4 y | feature | - | - |
| [#6579](https://github.com/expressjs/express/issues/6579) | Combinations of middleware series with "app.all" is broken since 4.18.0 | 0 | 2 | 17 mo | bug-claim | - | - |
| [#7427](https://github.com/expressjs/express/issues/7427) | router.use() silently accepts express() sub-apps  without prototype restoration | 0 | 1 | 3 mo | bug-claim | - | not run (triager: expected) |
| [#6724](https://github.com/expressjs/express/issues/6724) | TypeError: Missing parameter name at 2: https://git.new/pathToRegexpError | 0 | 0 | 15 mo | docs | - | - |

Open PRs in this theme: [#3770](https://github.com/expressjs/express/pull/3770) (rejected-direction), [#5007](https://github.com/expressjs/express/pull/5007) (stalled), [#7286](https://github.com/expressjs/express/pull/7286) (stalled-good), [#7396](https://github.com/expressjs/express/pull/7396) (stalled), [#7531](https://github.com/expressjs/express/pull/7531) (maintainer), [#7561](https://github.com/expressjs/express/pull/7561) (maintainer-6.x)

### req/res API magic and surprising behaviour

35 open issues, 47 open PRs. Total reactions on the issues: 49; total comments: 211.

| Issue | Title | Reactions | Comments | Age | Kind | Open PR that fixes it | Repro on master |
|---|---|---|---|---|---|---|---|
| [#2472](https://github.com/expressjs/express/issues/2472) | Option to disable ETag for certain routes? | 23 | 11 | 12 y | feature | [#6994](https://github.com/expressjs/express/pull/6994) | - |
| [#2812](https://github.com/expressjs/express/issues/2812) | Decoupling express.request and express.response from express application | 5 | 11 | 11 y | design | - | - |
| [#5623](https://github.com/expressjs/express/issues/5623) | [v5] Lock down valid status code ranges to 1xx through 5xx | 4 | 11 | 3 y | design | [#5856](https://github.com/expressjs/express/pull/5856) | - |
| [#4697](https://github.com/expressjs/express/issues/4697) | Request: Introduce a 'req.completeURL()' method | 4 | 3 | 5 y | feature | [#4958](https://github.com/expressjs/express/pull/4958) | - |
| [#2249](https://github.com/expressjs/express/issues/2249) | Deprecate res.send(obj) json overload | 3 | 19 | 12 y | design | [#7553](https://github.com/expressjs/express/pull/7553) (6.x) | - |
| [#6941](https://github.com/expressjs/express/issues/6941) | res.redirect(undefined) sends invalid Location: undefined header | 2 | 8 | 12 mo | design | [#6404](https://github.com/expressjs/express/pull/6404) | - |
| [#3945](https://github.com/expressjs/express/issues/3945) | why not make middleware or hooks that works exactly before sending response that could change or alter the response object | 2 | 5 | 8 y | design | - | - |
| [#4536](https://github.com/expressjs/express/issues/4536) | Some fetch similarities | 2 | 3 | 6 y | feature | - | - |
| [#2216](https://github.com/expressjs/express/issues/2216) | remove .get() and .set() functions for settings | 1 | 12 | 12 y | design | [#3714](https://github.com/expressjs/express/pull/3714) | - |
| [#5986](https://github.com/expressjs/express/issues/5986) | ETag should consider CORS headers | 1 | 8 | 2 y | design | [#6884](https://github.com/expressjs/express/pull/6884) | - |
| [#4099](https://github.com/expressjs/express/issues/4099) | Change the interface for setting application settings | 1 | 5 | 7 y | design | [#3714](https://github.com/expressjs/express/pull/3714) | - |
| [#7334](https://github.com/expressjs/express/issues/7334) | Propuesta: Abstracción nativa/wrapper en Express para simplificar el manejo de respuestas SSE (Server-Sent Events) | 1 | 5 | 5 mo | feature | [#7338](https://github.com/expressjs/express/pull/7338) | - |
| [#2432](https://github.com/expressjs/express/issues/2432) | Move req / res prototype extension to a separate repo | 0 | 12 | 12 y | design | - | - |
| [#4944](https://github.com/expressjs/express/issues/4944) | response.download does not return /proc/* files | 0 | 12 | 4 y | bug | - (send module) | reproduced (Content-Length: 0, file not sent) |
| [#3555](https://github.com/expressjs/express/issues/3555) | node http code change could have major effect on express | 0 | 11 | 9 y | design | - | - |
| [#6756](https://github.com/expressjs/express/issues/6756) | 'TypeError: Do not know how to serialize a BigInt' when using sendStatus with a BigNum instead of intended error message | 0 | 11 | 14 mo | bug-claim | [#6758](https://github.com/expressjs/express/pull/6758), [#7130](https://github.com/expressjs/express/pull/7130) | - |
| [#3536](https://github.com/expressjs/express/issues/3536) | Feature request: ability to set settings per response | 0 | 8 | 9 y | feature | [#2935](https://github.com/expressjs/express/pull/2935) | - |
| [#7362](https://github.com/expressjs/express/issues/7362) | res.send(ArrayBuffer) silently sends {} as JSON | 0 | 7 | 5 mo | bug | [#7363](https://github.com/expressjs/express/pull/7363), [#7410](https://github.com/expressjs/express/pull/7410) | reproduced |
| [#2811](https://github.com/expressjs/express/issues/2811) | Express and middleware that manipulate reponses | 0 | 6 | 11 y | design | - | - |
| [#3951](https://github.com/expressjs/express/issues/3951) | express checks referrer first, then referer next | 0 | 6 | 8 y | design | [#6993](https://github.com/expressjs/express/pull/6993) | - |
| [#5626](https://github.com/expressjs/express/issues/5626) | Can not set response headers when send a json body in a options request | 0 | 6 | 3 y | bug-claim | - | not reproduced |
| [#7034](https://github.com/expressjs/express/issues/7034) | res.set('Content-Type') silently sets header to literal string 'false' for unknown types | 0 | 5 | 9 mo | bug | [#7035](https://github.com/expressjs/express/pull/7035), [#7146](https://github.com/expressjs/express/pull/7146), [#7283](https://github.com/expressjs/express/pull/7283) | reproduced |
| [#2945](https://github.com/expressjs/express/issues/2945) | Make express.static use the "etag" application setting | 0 | 4 | 11 y | feature | - | - |
| [#5150](https://github.com/expressjs/express/issues/5150) | res.cookie does not allow setting Max-Age only, without Expires (One should be able to set maxAge alone, with expires: 0) | 0 | 4 | 4 y | bug | [#5151](https://github.com/expressjs/express/pull/5151) | reproduced |
| [#2575](https://github.com/expressjs/express/issues/2575) | links() function insufficient for attributes other than 'rel' | 0 | 3 | 12 y | feature | [#2738](https://github.com/expressjs/express/pull/2738) | - |
| [#4750](https://github.com/expressjs/express/issues/4750) | custom ETag function isn't working for SendFile | 0 | 3 | 5 y | bug-claim | [#7467](https://github.com/expressjs/express/pull/7467) (related) | reproduced (per-call etag:false ignored; see PR #7467) |
| [#6669](https://github.com/expressjs/express/issues/6669) | The Great Monkey-Patch Safari | 0 | 3 | 16 mo | design | - | - |
| [#7506](https://github.com/expressjs/express/issues/7506) | res.redirect() sets Content-Length when Transfer-Encoding is already set | 0 | 2 | 2 mo | bug | [#7508](https://github.com/expressjs/express/pull/7508) | reproduced |
| [#2562](https://github.com/expressjs/express/issues/2562) | Application may be a class | 0 | 1 | 12 y | design | - | - |
| [#3097](https://github.com/expressjs/express/issues/3097) | Add req.search property containing unparsed query string | 0 | 1 | 10 y | feature | - | - |
| [#4755](https://github.com/expressjs/express/issues/4755) | Ability to get req and res context inside json replacer | 0 | 1 | 5 y | feature | [#3981](https://github.com/expressjs/express/pull/3981), [#7603](https://github.com/expressjs/express/pull/7603) | - |
| [#6039](https://github.com/expressjs/express/issues/6039) | Response built by express is broken if res and req don't extend node's http.IncomingMessage and http.ServerResponse | 0 | 1 | 2 y | bug-claim | [#6047](https://github.com/expressjs/express/pull/6047) | - |
| [#7145](https://github.com/expressjs/express/issues/7145) | Remove magic from 'res.set' | 0 | 1 | 8 mo | design | [#7146](https://github.com/expressjs/express/pull/7146), [#7283](https://github.com/expressjs/express/pull/7283) | - |
| [#7510](https://github.com/expressjs/express/issues/7510) | res.send(DataView) silently drops the view’s bytes | 0 | 1 | 1 mo | bug | [#7511](https://github.com/expressjs/express/pull/7511), [#7574](https://github.com/expressjs/express/pull/7574) | reproduced |
| [#7538](https://github.com/expressjs/express/issues/7538) | res.send() with a non-Uint8Array typed array loses data, or returns 500 without ETag | 0 | 1 | 1 mo | bug | [#7542](https://github.com/expressjs/express/pull/7542), [#7574](https://github.com/expressjs/express/pull/7574) | reproduced |

Open PRs in this theme: [#2422](https://github.com/expressjs/express/pull/2422) (design-stalled), [#2738](https://github.com/expressjs/express/pull/2738) (abandoned), [#2935](https://github.com/expressjs/express/pull/2935) (abandoned), [#3714](https://github.com/expressjs/express/pull/3714) (maintainer-wip), [#3981](https://github.com/expressjs/express/pull/3981) (abandoned), [#4044](https://github.com/expressjs/express/pull/4044) (abandoned), [#4958](https://github.com/expressjs/express/pull/4958) (abandoned), [#5151](https://github.com/expressjs/express/pull/5151) (stalled-good), [#5320](https://github.com/expressjs/express/pull/5320) (needs-work), [#5652](https://github.com/expressjs/express/pull/5652) (cosmetic), [#5856](https://github.com/expressjs/express/pull/5856) (needs-work), [#6047](https://github.com/expressjs/express/pull/6047) (needs-work), [#6086](https://github.com/expressjs/express/pull/6086) (needs-work), [#6101](https://github.com/expressjs/express/pull/6101) (cosmetic), [#6126](https://github.com/expressjs/express/pull/6126) (cosmetic), [#6136](https://github.com/expressjs/express/pull/6136) (cosmetic), [#6138](https://github.com/expressjs/express/pull/6138) (cosmetic), [#6139](https://github.com/expressjs/express/pull/6139) (cosmetic), [#6140](https://github.com/expressjs/express/pull/6140) (cosmetic-approved), [#6703](https://github.com/expressjs/express/pull/6703) (maintainer), [#6758](https://github.com/expressjs/express/pull/6758) (needs-work), [#6875](https://github.com/expressjs/express/pull/6875) (needs-work), [#6884](https://github.com/expressjs/express/pull/6884) (rejected-direction), [#7035](https://github.com/expressjs/express/pull/7035) (stalled-good), [#7045](https://github.com/expressjs/express/pull/7045) (stalled), [#7130](https://github.com/expressjs/express/pull/7130) (duplicate), [#7146](https://github.com/expressjs/express/pull/7146) (6.x-candidate), [#7161](https://github.com/expressjs/express/pull/7161) (stalled-good), [#7275](https://github.com/expressjs/express/pull/7275) (stalled), [#7283](https://github.com/expressjs/express/pull/7283) (duplicate), [#7320](https://github.com/expressjs/express/pull/7320) (stalled), [#7332](https://github.com/expressjs/express/pull/7332) (stalled), [#7338](https://github.com/expressjs/express/pull/7338) (stalled), [#7363](https://github.com/expressjs/express/pull/7363) (stalled-good), [#7395](https://github.com/expressjs/express/pull/7395) (rejected-direction), [#7407](https://github.com/expressjs/express/pull/7407) (stalled), [#7408](https://github.com/expressjs/express/pull/7408) (rejected-direction), [#7410](https://github.com/expressjs/express/pull/7410) (duplicate), [#7452](https://github.com/expressjs/express/pull/7452) (maintainer-draft), [#7467](https://github.com/expressjs/express/pull/7467) (stalled-good), [#7479](https://github.com/expressjs/express/pull/7479) (stalled), [#7508](https://github.com/expressjs/express/pull/7508) (stalled-good), [#7511](https://github.com/expressjs/express/pull/7511) (stalled-good), [#7542](https://github.com/expressjs/express/pull/7542) (duplicate), [#7574](https://github.com/expressjs/express/pull/7574) (stalled-good), [#7578](https://github.com/expressjs/express/pull/7578) (stalled), [#7603](https://github.com/expressjs/express/pull/7603) (new)

### Error handling and async

12 open issues, 6 open PRs. Total reactions on the issues: 76; total comments: 121.

| Issue | Title | Reactions | Comments | Age | Kind | Open PR that fixes it | Repro on master |
|---|---|---|---|---|---|---|---|
| [#2896](https://github.com/expressjs/express/issues/2896) | Define error-handling middleware functions explicitly (without arity detection) | 70 | 23 | 11 y | design | [router#59](https://github.com/pillarjs/router/pull/59) | - |
| [#6951](https://github.com/expressjs/express/issues/6951) | Standardize on error codes for errors express throws | 6 | 5 | 11 mo | design | [#6982](https://github.com/expressjs/express/pull/6982) | - |
| [#3367](https://github.com/expressjs/express/issues/3367) | Suggestion: Implicitly-named error handler | 0 | 22 | 9 y | design | - | - |
| [#2263](https://github.com/expressjs/express/issues/2263) | Default responder should not console.error 4xx errors | 0 | 17 | 12 y | design | - | - |
| [#6756](https://github.com/expressjs/express/issues/6756) | 'TypeError: Do not know how to serialize a BigInt' when using sendStatus with a BigNum instead of intended error message | 0 | 11 | 14 mo | bug-claim | [#6758](https://github.com/expressjs/express/pull/6758), [#7130](https://github.com/expressjs/express/pull/7130) | - |
| [#4298](https://github.com/expressjs/express/issues/4298) | req.params undefined with unspecified res.format default | 0 | 10 | 7 y | bug | - | reproduced (likely router design) |
| [#4186](https://github.com/expressjs/express/issues/4186) | Zone.js for async error handling | 0 | 9 | 7 y | design | - | - |
| [#7350](https://github.com/expressjs/express/issues/7350) | res.render()/app.render() throws opaque TypeError for a view name ending in "." | 0 | 8 | 5 mo | bug | [#7351](https://github.com/expressjs/express/pull/7351), [#7392](https://github.com/expressjs/express/pull/7392) | reproduced |
| [#2483](https://github.com/expressjs/express/issues/2483) | Route param error handle | 0 | 6 | 12 y | bug-claim | - | - |
| [#5249](https://github.com/expressjs/express/issues/5249) | Extension to add Global Error Handler/Response Handler  | 0 | 5 | 3 y | feature | - | - |
| [#2526](https://github.com/expressjs/express/issues/2526) | path specific error handler not called | 0 | 3 | 12 y | bug-claim | - | reproduced (by design) |
| [#7560](https://github.com/expressjs/express/issues/7560) | res.render() crashes the process with an uncaught ERR_HTTP_HEADERS_SENT when the response was already sent | 0 | 2 | 1 mo | bug | [#7559](https://github.com/expressjs/express/pull/7559) | reproduced |

Open PRs in this theme: [#6758](https://github.com/expressjs/express/pull/6758) (needs-work), [#6959](https://github.com/expressjs/express/pull/6959) (stalled), [#6982](https://github.com/expressjs/express/pull/6982) (maintainer), [#7041](https://github.com/expressjs/express/pull/7041) (stalled), [#7501](https://github.com/expressjs/express/pull/7501) (needs-work), [#7559](https://github.com/expressjs/express/pull/7559) (stalled-good)

### Security and header handling (host, redirects, trust proxy, query limits)

14 open issues, 20 open PRs. Total reactions on the issues: 11; total comments: 71.

| Issue | Title | Reactions | Comments | Age | Kind | Open PR that fixes it | Repro on master |
|---|---|---|---|---|---|---|---|
| [#3346](https://github.com/expressjs/express/issues/3346) | default env to production | 6 | 11 | 9 y | design | [#7549](https://github.com/expressjs/express/pull/7549) (6.x) | - |
| [#6941](https://github.com/expressjs/express/issues/6941) | res.redirect(undefined) sends invalid Location: undefined header | 2 | 8 | 12 mo | design | [#6404](https://github.com/expressjs/express/pull/6404) | - |
| [#5878](https://github.com/expressjs/express/issues/5878) | Query Param Silently Remove param query value if it is over 1000 | 1 | 12 | 2 y | bug | [#7117](https://github.com/expressjs/express/pull/7117), [#5901](https://github.com/expressjs/express/pull/5901) | reproduced |
| [#6395](https://github.com/expressjs/express/issues/6395) | Proposal: Implementation of Short-Term In-Memory Cache in Express for Mitigating Traffic Spikes and Preventing DDoS | 1 | 10 | 20 mo | feature | - | - |
| [#7564](https://github.com/expressjs/express/issues/7564) | Express 4: update body-parser minimum to 1.20.9 for security fix | 1 | 1 | 1 mo | deps | merged [#7565](https://github.com/expressjs/express/pull/7565) (4.x) | already fixed on 4.x branch (#7565) |
| [#4557](https://github.com/expressjs/express/issues/4557) | 'App.use(path, ...)' Does Not Mount at ''//'' | 0 | 7 | 6 y | bug | [#7286](https://github.com/expressjs/express/pull/7286), [router#190](https://github.com/pillarjs/router/pull/190) | reproduced |
| [#3951](https://github.com/expressjs/express/issues/3951) | express checks referrer first, then referer next | 0 | 6 | 8 y | design | [#6993](https://github.com/expressjs/express/pull/6993) | - |
| [#7140](https://github.com/expressjs/express/issues/7140) | View.prototype.lookup() lacks path containment check (unlike send library for res.sendFile) | 0 | 5 | 8 mo | design | [#7142](https://github.com/expressjs/express/pull/7142) | - |
| [#6541](https://github.com/expressjs/express/issues/6541) | "trust proxy" callback called multiple times on single request | 0 | 3 | 6 y | bug-claim | [#7387](https://github.com/expressjs/express/pull/7387) | not run (by design per dougwilson) |
| [#5995](https://github.com/expressjs/express/issues/5995) | Add encryption as a new feature/option to the cookies provided with secret | 0 | 2 | 2 y | feature | [#7113](https://github.com/expressjs/express/pull/7113) | - |
| [#7506](https://github.com/expressjs/express/issues/7506) | res.redirect() sets Content-Length when Transfer-Encoding is already set | 0 | 2 | 2 mo | bug | [#7508](https://github.com/expressjs/express/pull/7508) | reproduced |
| [#7532](https://github.com/expressjs/express/issues/7532) | req.subdomains splits an IPv6 host that contains dots | 0 | 2 | 1 mo | bug | [#7533](https://github.com/expressjs/express/pull/7533) | reproduced |
| [#3097](https://github.com/expressjs/express/issues/3097) | Add req.search property containing unparsed query string | 0 | 1 | 10 y | feature | - | - |
| [#7427](https://github.com/expressjs/express/issues/7427) | router.use() silently accepts express() sub-apps  without prototype restoration | 0 | 1 | 3 mo | bug-claim | - | not run (triager: expected) |

Open PRs in this theme: [#5901](https://github.com/expressjs/express/pull/5901) (stalled), [#6404](https://github.com/expressjs/express/pull/6404) (maintainer-6.x), [#6865](https://github.com/expressjs/express/pull/6865) (stalled), [#6892](https://github.com/expressjs/express/pull/6892) (stalled), [#6893](https://github.com/expressjs/express/pull/6893) (stalled), [#6993](https://github.com/expressjs/express/pull/6993) (maintainer-6.x), [#7113](https://github.com/expressjs/express/pull/7113) (stalled), [#7117](https://github.com/expressjs/express/pull/7117) (needs-work), [#7142](https://github.com/expressjs/express/pull/7142) (rejected-direction), [#7151](https://github.com/expressjs/express/pull/7151) (discussion), [#7161](https://github.com/expressjs/express/pull/7161) (stalled-good), [#7317](https://github.com/expressjs/express/pull/7317) (maintainer-tc), [#7330](https://github.com/expressjs/express/pull/7330) (stalled), [#7331](https://github.com/expressjs/express/pull/7331) (stalled), [#7387](https://github.com/expressjs/express/pull/7387) (stalled), [#7485](https://github.com/expressjs/express/pull/7485) (stalled), [#7495](https://github.com/expressjs/express/pull/7495) (stalled), [#7496](https://github.com/expressjs/express/pull/7496) (stalled), [#7508](https://github.com/expressjs/express/pull/7508) (stalled-good), [#7533](https://github.com/expressjs/express/pull/7533) (stalled-good)

### Performance

5 open issues, 9 open PRs. Total reactions on the issues: 26; total comments: 40.

| Issue | Title | Reactions | Comments | Age | Kind | Open PR that fixes it | Repro on master |
|---|---|---|---|---|---|---|---|
| [#2472](https://github.com/expressjs/express/issues/2472) | Option to disable ETag for certain routes? | 23 | 11 | 12 y | feature | [#6994](https://github.com/expressjs/express/pull/6994) | - |
| [#5906](https://github.com/expressjs/express/issues/5906) | Cache 'accepts' Instance in Request Methods? | 2 | 4 | 2 y | feature | [#7008](https://github.com/expressjs/express/pull/7008) | - |
| [#6395](https://github.com/expressjs/express/issues/6395) | Proposal: Implementation of Short-Term In-Memory Cache in Express for Mitigating Traffic Spikes and Preventing DDoS | 1 | 10 | 20 mo | feature | - | - |
| [#2432](https://github.com/expressjs/express/issues/2432) | Move req / res prototype extension to a separate repo | 0 | 12 | 12 y | design | - | - |
| [#6669](https://github.com/expressjs/express/issues/6669) | The Great Monkey-Patch Safari | 0 | 3 | 16 mo | design | - | - |

Open PRs in this theme: [#6742](https://github.com/expressjs/express/pull/6742) (draft), [#6994](https://github.com/expressjs/express/pull/6994) (needs-work), [#7008](https://github.com/expressjs/express/pull/7008) (needs-work), [#7481](https://github.com/expressjs/express/pull/7481) (stalled), [#7515](https://github.com/expressjs/express/pull/7515) (stalled), [#7516](https://github.com/expressjs/express/pull/7516) (stalled), [#7517](https://github.com/expressjs/express/pull/7517) (stalled), [#7519](https://github.com/expressjs/express/pull/7519) (stalled), [#7555](https://github.com/expressjs/express/pull/7555) (draft)

### TypeScript and types

5 open issues, 2 open PRs. Total reactions on the issues: 16; total comments: 56.

| Issue | Title | Reactions | Comments | Age | Kind | Open PR that fixes it | Repro on master |
|---|---|---|---|---|---|---|---|
| [#2818](https://github.com/expressjs/express/issues/2818) | include "typings" field in package.json | 12 | 34 | 11 y | design | [#6382](https://github.com/expressjs/express/pull/6382) | - |
| [#6370](https://github.com/expressjs/express/issues/6370) | wrong signature for req.body and next() | 3 | 13 | 21 mo | types | - | - |
| [#7231](https://github.com/expressjs/express/issues/7231) | Docs: Add instructions for TypeScript | 1 | 0 | 6 mo | docs | [#7369](https://github.com/expressjs/express/pull/7369) | - |
| [#2756](https://github.com/expressjs/express/issues/2756) | feat: Support typed params in routes | 0 | 6 | 11 y | feature | - | - |
| [#6385](https://github.com/expressjs/express/issues/6385) | Typings for Send accept a Promise but the function doesn't await it | 0 | 3 | 20 mo | types | - | - |

Open PRs in this theme: [#4942](https://github.com/expressjs/express/pull/4942) (abandoned), [#6382](https://github.com/expressjs/express/pull/6382) (blocked)

### Dependencies and supply chain

4 open issues, 8 open PRs. Total reactions on the issues: 2; total comments: 12.

| Issue | Title | Reactions | Comments | Age | Kind | Open PR that fixes it | Repro on master |
|---|---|---|---|---|---|---|---|
| [#6647](https://github.com/expressjs/express/issues/6647) | Dependency graph improvements (via npmgraph.js.org) | 1 | 4 | 16 mo | deps | [#6865](https://github.com/expressjs/express/pull/6865) | - |
| [#7564](https://github.com/expressjs/express/issues/7564) | Express 4: update body-parser minimum to 1.20.9 for security fix | 1 | 1 | 1 mo | deps | merged [#7565](https://github.com/expressjs/express/pull/7565) (4.x) | already fixed on 4.x branch (#7565) |
| [#7547](https://github.com/expressjs/express/issues/7547) | Update to mocha 12.x | 0 | 6 | 1 mo | deps | [#7548](https://github.com/expressjs/express/pull/7548), [#7557](https://github.com/expressjs/express/pull/7557) | - |
| [#7502](https://github.com/expressjs/express/issues/7502) | Express: review of dependencies and sub dependencies | 0 | 1 | 2 mo | deps | - | - |

Open PRs in this theme: [#6113](https://github.com/expressjs/express/pull/6113) (needs-work), [#6118](https://github.com/expressjs/express/pull/6118) (blocked), [#6856](https://github.com/expressjs/express/pull/6856) (superseded), [#6865](https://github.com/expressjs/express/pull/6865) (stalled), [#6912](https://github.com/expressjs/express/pull/6912) (blocked), [#7548](https://github.com/expressjs/express/pull/7548) (duplicate), [#7557](https://github.com/expressjs/express/pull/7557) (stalled), [#7600](https://github.com/expressjs/express/pull/7600) (maintainer)

### Docs-only

6 open issues, 11 open PRs. Total reactions on the issues: 1; total comments: 2.

| Issue | Title | Reactions | Comments | Age | Kind | Open PR that fixes it | Repro on master |
|---|---|---|---|---|---|---|---|
| [#7231](https://github.com/expressjs/express/issues/7231) | Docs: Add instructions for TypeScript | 1 | 0 | 6 mo | docs | [#7369](https://github.com/expressjs/express/pull/7369) | - |
| [#7525](https://github.com/expressjs/express/issues/7525) | JSDoc for the req.query getter documents the wrong return type | 0 | 1 | 1 mo | docs | [#7526](https://github.com/expressjs/express/pull/7526) | - |
| [#7588](https://github.com/expressjs/express/issues/7588) | Outdated res.send() syntax in lib/response.js documentation example | 0 | 1 | 1 mo | docs | [#7534](https://github.com/expressjs/express/pull/7534) | - |
| [#6724](https://github.com/expressjs/express/issues/6724) | TypeError: Missing parameter name at 2: https://git.new/pathToRegexpError | 0 | 0 | 15 mo | docs | - | - |
| [#7527](https://github.com/expressjs/express/issues/7527) | Readme: project name 'express.js' is not capitalized | 0 | 0 | 1 mo | docs | [#7539](https://github.com/expressjs/express/pull/7539) | - |
| [#7592](https://github.com/expressjs/express/issues/7592) | Use cross-platform directory name in QS guide | 0 | 0 | 0 mo | docs | [#7593](https://github.com/expressjs/express/pull/7593) | - |

Open PRs in this theme: [#6133](https://github.com/expressjs/express/pull/6133) (needs-work), [#6786](https://github.com/expressjs/express/pull/6786) (stalled), [#7119](https://github.com/expressjs/express/pull/7119) (stalled), [#7369](https://github.com/expressjs/express/pull/7369) (stalled), [#7388](https://github.com/expressjs/express/pull/7388) (approved-stalled), [#7452](https://github.com/expressjs/express/pull/7452) (maintainer-draft), [#7470](https://github.com/expressjs/express/pull/7470) (stalled), [#7526](https://github.com/expressjs/express/pull/7526) (stalled), [#7534](https://github.com/expressjs/express/pull/7534) (stalled), [#7539](https://github.com/expressjs/express/pull/7539) (duplicate), [#7593](https://github.com/expressjs/express/pull/7593) (stalled)

### Views and rendering (extra theme)

11 open issues, 11 open PRs. Total reactions on the issues: 6; total comments: 85.

| Issue | Title | Reactions | Comments | Age | Kind | Open PR that fixes it | Repro on master |
|---|---|---|---|---|---|---|---|
| [#2982](https://github.com/expressjs/express/issues/2982) | Rendering engine without view files | 2 | 14 | 11 y | feature | [#3114](https://github.com/expressjs/express/pull/3114) | - |
| [#3485](https://github.com/expressjs/express/issues/3485) | Auto file extension lookup with multiple view engines | 2 | 2 | 9 y | feature | [#3569](https://github.com/expressjs/express/pull/3569) | - |
| [#2907](https://github.com/expressjs/express/issues/2907) | View composers | 1 | 13 | 11 y | feature | - | - |
| [#4594](https://github.com/expressjs/express/issues/4594) | 'ext' should be case-insensitive for view engines. | 1 | 3 | 6 y | feature | [#7051](https://github.com/expressjs/express/pull/7051) | - |
| [#2217](https://github.com/expressjs/express/issues/2217) | refactor view engine | 0 | 15 | 12 y | design | - | - |
| [#2708](https://github.com/expressjs/express/issues/2708) | Feature request View global option ignore extname | 0 | 12 | 11 y | feature | - | - |
| [#7350](https://github.com/expressjs/express/issues/7350) | res.render()/app.render() throws opaque TypeError for a view name ending in "." | 0 | 8 | 5 mo | bug | [#7351](https://github.com/expressjs/express/pull/7351), [#7392](https://github.com/expressjs/express/pull/7392) | reproduced |
| [#2474](https://github.com/expressjs/express/issues/2474) | Feature request: Add a custom event 'render' (due 'req.route' & routing middleware nature) | 0 | 7 | 12 y | feature | - | - |
| [#7140](https://github.com/expressjs/express/issues/7140) | View.prototype.lookup() lacks path containment check (unlike send library for res.sendFile) | 0 | 5 | 8 mo | design | [#7142](https://github.com/expressjs/express/pull/7142) | - |
| [#3057](https://github.com/expressjs/express/issues/3057) | app.locals not passed down to a subapp | 0 | 4 | 10 y | design | - | - |
| [#7560](https://github.com/expressjs/express/issues/7560) | res.render() crashes the process with an uncaught ERR_HTTP_HEADERS_SENT when the response was already sent | 0 | 2 | 1 mo | bug | [#7559](https://github.com/expressjs/express/pull/7559) | reproduced |

Open PRs in this theme: [#2653](https://github.com/expressjs/express/pull/2653) (stalled-good), [#3114](https://github.com/expressjs/express/pull/3114) (abandoned), [#3569](https://github.com/expressjs/express/pull/3569) (stalled), [#3613](https://github.com/expressjs/express/pull/3613) (abandoned), [#6800](https://github.com/expressjs/express/pull/6800) (cosmetic), [#7051](https://github.com/expressjs/express/pull/7051) (stalled), [#7142](https://github.com/expressjs/express/pull/7142) (rejected-direction), [#7351](https://github.com/expressjs/express/pull/7351) (stalled-good), [#7392](https://github.com/expressjs/express/pull/7392) (duplicate), [#7541](https://github.com/expressjs/express/pull/7541) (stalled-good), [#7559](https://github.com/expressjs/express/pull/7559) (stalled-good)

### HTTP/2 and non-Node runtimes (extra theme)

6 open issues, 2 open PRs. Total reactions on the issues: 33; total comments: 28.

| Issue | Title | Reactions | Comments | Age | Kind | Open PR that fixes it | Repro on master |
|---|---|---|---|---|---|---|---|
| [#5462](https://github.com/expressjs/express/issues/5462) | http/2 initiative  | 32 | 6 | 3 y | feature | [#3730](https://github.com/expressjs/express/pull/3730) | - |
| [#2781](https://github.com/expressjs/express/issues/2781) | Feature request: friendly exposure of req/res logic for HTTP/2 push promises | 1 | 3 | 11 y | feature | - | - |
| [#3555](https://github.com/expressjs/express/issues/3555) | node http code change could have major effect on express | 0 | 11 | 9 y | design | - | - |
| [#4959](https://github.com/expressjs/express/issues/4959) | SNICallback native | 0 | 5 | 4 y | feature | - | - |
| [#6863](https://github.com/expressjs/express/issues/6863) | How to use Express server with 'http2.createSecureServer' for HTTP/2? | 0 | 2 | 13 mo | support | - | - |
| [#6039](https://github.com/expressjs/express/issues/6039) | Response built by express is broken if res and req don't extend node's http.IncomingMessage and http.ServerResponse | 0 | 1 | 2 y | bug-claim | [#6047](https://github.com/expressjs/express/pull/6047) | - |

Open PRs in this theme: [#3730](https://github.com/expressjs/express/pull/3730) (stalled-big), [#6047](https://github.com/expressjs/express/pull/6047) (needs-work)

### Project process, examples and tooling (extra theme)

5 open issues, 36 open PRs. Total reactions on the issues: 3; total comments: 36.

| Issue | Title | Reactions | Comments | Age | Kind | Open PR that fixes it | Repro on master |
|---|---|---|---|---|---|---|---|
| [#6739](https://github.com/expressjs/express/issues/6739) | (FR): esm support | 2 | 4 | 15 mo | design | - | - |
| [#5309](https://github.com/expressjs/express/issues/5309) | Split the examples from this repo | 1 | 8 | 3 y | process | [#5311](https://github.com/expressjs/express/pull/5311), [#5492](https://github.com/expressjs/express/pull/5492) | - |
| [#2888](https://github.com/expressjs/express/issues/2888) | discuss commit guidelines | 0 | 18 | 11 y | process | - | - |
| [#3062](https://github.com/expressjs/express/issues/3062) | Debug namespace is not microservices (SOA) oriented | 0 | 5 | 10 y | feature | - | - |
| [#2698](https://github.com/expressjs/express/issues/2698) | debug module with dynamic behavior (enable/disable in runtime) | 0 | 1 | 11 y | feature | - | - |

Open PRs in this theme: [#3427](https://github.com/expressjs/express/pull/3427) (abandoned), [#3538](https://github.com/expressjs/express/pull/3538) (abandoned), [#4680](https://github.com/expressjs/express/pull/4680) (abandoned), [#4794](https://github.com/expressjs/express/pull/4794) (abandoned), [#4942](https://github.com/expressjs/express/pull/4942) (abandoned), [#4946](https://github.com/expressjs/express/pull/4946) (abandoned), [#5225](https://github.com/expressjs/express/pull/5225) (abandoned), [#5311](https://github.com/expressjs/express/pull/5311) (maintainer-draft), [#5492](https://github.com/expressjs/express/pull/5492) (maintainer-draft), [#5503](https://github.com/expressjs/express/pull/5503) (moved), [#5662](https://github.com/expressjs/express/pull/5662) (maintainer-draft), [#6110](https://github.com/expressjs/express/pull/6110) (approved-stalled), [#6118](https://github.com/expressjs/express/pull/6118) (blocked), [#6145](https://github.com/expressjs/express/pull/6145) (stalled), [#6153](https://github.com/expressjs/express/pull/6153) (needs-work), [#6286](https://github.com/expressjs/express/pull/6286) (needs-work), [#6306](https://github.com/expressjs/express/pull/6306) (needs-work), [#6412](https://github.com/expressjs/express/pull/6412) (moved), [#6480](https://github.com/expressjs/express/pull/6480) (blocked), [#6689](https://github.com/expressjs/express/pull/6689) (stalled), [#6912](https://github.com/expressjs/express/pull/6912) (blocked), [#6959](https://github.com/expressjs/express/pull/6959) (stalled), [#6970](https://github.com/expressjs/express/pull/6970) (maintainer-draft), [#7038](https://github.com/expressjs/express/pull/7038) (stalled), [#7041](https://github.com/expressjs/express/pull/7041) (stalled), [#7050](https://github.com/expressjs/express/pull/7050) (stalled), [#7059](https://github.com/expressjs/express/pull/7059) (stalled), [#7061](https://github.com/expressjs/express/pull/7061) (stalled), [#7092](https://github.com/expressjs/express/pull/7092) (stalled), [#7339](https://github.com/expressjs/express/pull/7339) (stalled), [#7423](https://github.com/expressjs/express/pull/7423) (stalled), [#7495](https://github.com/expressjs/express/pull/7495) (stalled), [#7496](https://github.com/expressjs/express/pull/7496) (stalled), [#7546](https://github.com/expressjs/express/pull/7546) (stalled), [#7572](https://github.com/expressjs/express/pull/7572) (stalled), [#7573](https://github.com/expressjs/express/pull/7573) (waiting)

### Support questions (noise)

4 open issues, 0 open PRs. Total reactions on the issues: 0; total comments: 29.

| Issue | Title | Reactions | Comments | Age | Kind | Open PR that fixes it | Repro on master |
|---|---|---|---|---|---|---|---|
| [#5008](https://github.com/expressjs/express/issues/5008) | ERR_EMPTY_RESPONSE every time i try to access from a device not local | 0 | 16 | 4 y | support | - | - |
| [#6926](https://github.com/expressjs/express/issues/6926) | I am unable to set cookies in vercel app for my application. While my backend is deployed in render. | 0 | 10 | 12 mo | support | - | - |
| [#6863](https://github.com/expressjs/express/issues/6863) | How to use Express server with 'http2.createSecureServer' for HTTP/2? | 0 | 2 | 13 mo | support | - | - |
| [#4889](https://github.com/expressjs/express/issues/4889) | How to hold a response? And are there something called "maxHeldResponseCount"? | 0 | 1 | 5 y | support | - | - |

## Appendix: every open PR (excluding 6.x #7549 to #7554)

What each class means:

- **stalled-good**: reproduced bug, small change, no objections.
- **stalled**: no maintainer response yet.
- **needs-work**: a maintainer asked for changes.
- **abandoned**: the author went quiet, the PR conflicts, or it targets the dead 5.0 branch.
- **duplicate**: another open PR covers it.
- **cosmetic**: a style-only refactor.
- **rejected-direction**: a maintainer said this is not the way.
- **maintainer-***: a maintainer owns it.
- **blocked**: waiting on a team decision.

| PR | Title | Opened | Review state | Class | Note |
|---|---|---|---|---|---|
| [#2422](https://github.com/expressjs/express/pull/2422) | Optional custom json replacer/spaces per response | 2014-10-29 | REVIEW_REQUIRED | design-stalled | per-response JSON replacer; Doug asked for a different API in 2014 |
| [#2653](https://github.com/expressjs/express/pull/2653) | Resolve paths for views asynchronously | 2015-05-18 | APPROVED | stalled-good | async view lookup; approved, maintainer reworked it 2026-07, now conflicting |
| [#2738](https://github.com/expressjs/express/pull/2738) | feat: Add array support to res.links() | 2015-08-21 | REVIEW_REQUIRED | abandoned | res.links arrays; conflicts, author asked 2026-01 |
| [#2935](https://github.com/expressjs/express/pull/2935) | Add support for overriding settings per request | 2016-03-11 | REVIEW_REQUIRED | abandoned | per-request settings; no review since 2016 |
| [#3114](https://github.com/expressjs/express/pull/3114) | Options for Engines | 2016-10-27 | REVIEW_REQUIRED | abandoned | engine options; 5.0 base, no tests |
| [#3427](https://github.com/expressjs/express/pull/3427) | Updating a couple of examples to ES6 syntax | 2017-09-26 | APPROVED | abandoned | examples ES6; approved 2017, needs rebase |
| [#3538](https://github.com/expressjs/express/pull/3538) | Example updated to ES6 syntax | 2018-01-17 | REVIEW_REQUIRED | abandoned | examples ES6 |
| [#3569](https://github.com/expressjs/express/pull/3569) | Auto file extension lookup with multiple view engines | 2018-02-16 | REVIEW_REQUIRED | stalled | multi-engine ext lookup; Wes +1 in 2018, never merged |
| [#3613](https://github.com/expressjs/express/pull/3613) | Add "view options" settings for rendering engines | 2018-04-02 | REVIEW_REQUIRED | abandoned | view options setting; needs tests |
| [#3714](https://github.com/expressjs/express/pull/3714) | Move settings methods to app.settings and deprecate old versions | 2018-08-11 | REVIEW_REQUIRED | maintainer-wip | settings object; Wes 2025-03 "need more time" |
| [#3730](https://github.com/expressjs/express/pull/3730) | Support http/2. | 2018-08-28 | REVIEW_REQUIRED | stalled-big | HTTP/2; 73 reactions, 5.0 base, needs rebase |
| [#3770](https://github.com/expressjs/express/pull/3770) | Allow to bypass middleware to last layer with next('last') | 2018-10-23 | REVIEW_REQUIRED | rejected-direction | next('last'); magic string disliked |
| [#3981](https://github.com/expressjs/express/pull/3981) | Provision to pass json replacer with a set of options. | 2019-06-13 | REVIEW_REQUIRED | abandoned | JSON replacer options |
| [#4044](https://github.com/expressjs/express/pull/4044) | added the ability to for app.set to accept a json of settings | 2019-09-02 | REVIEW_REQUIRED | abandoned | app.set(object) |
| [#4680](https://github.com/expressjs/express/pull/4680) | Express with SSL example | 2021-08-17 | REVIEW_REQUIRED | abandoned | SSL example |
| [#4794](https://github.com/expressjs/express/pull/4794) | Issue #4788 - ESM Module Example | 2022-01-25 | REVIEW_REQUIRED | abandoned | ESM example (5.0 base) |
| [#4942](https://github.com/expressjs/express/pull/4942) | TypeScript Example (CJS) | 2022-06-28 | REVIEW_REQUIRED | abandoned | TypeScript example (5.0 base) |
| [#4946](https://github.com/expressjs/express/pull/4946) | Clean architecture example | 2022-07-03 | REVIEW_REQUIRED | abandoned | clean-architecture example |
| [#4958](https://github.com/expressjs/express/pull/4958) | Implemented req.completeUrl | 2022-07-18 | REVIEW_REQUIRED | abandoned | req.completeUrl, no tests |
| [#5007](https://github.com/expressjs/express/pull/5007) | "merge params" option  | 2022-10-02 | REVIEW_REQUIRED | stalled | app "merge params" setting |
| [#5151](https://github.com/expressjs/express/pull/5151) | Don't automatically add Expires in res.cookie if expires option is explicitly set to 0 | 2023-03-19 | REVIEW_REQUIRED | stalled-good | res.cookie expires:0, 3 lines, never reviewed, no test |
| [#5225](https://github.com/expressjs/express/pull/5225) | Updated for modern versions of Node Redis | 2023-07-17 | REVIEW_REQUIRED | abandoned | redis example |
| [#5311](https://github.com/expressjs/express/pull/5311) | Split examples from Express Core | 2023-11-11 | REVIEW_REQUIRED, draft | maintainer-draft | split examples |
| [#5320](https://github.com/expressjs/express/pull/5320) | Do not auto-remove content headers for body-less status codes | 2023-11-16 | REVIEW_REQUIRED | needs-work | keep content headers on 204/304; maintainer doubts |
| [#5492](https://github.com/expressjs/express/pull/5492) | New Integration tests (example split continuation) | 2024-02-18 | APPROVED, draft | maintainer-draft | integration tests for split examples; approved draft |
| [#5503](https://github.com/expressjs/express/pull/5503) | add Github Access Structure Overview section | 2024-02-24 | CHANGES_REQUESTED | moved | governance doc; to move to discussions repo |
| [#5652](https://github.com/expressjs/express/pull/5652) | Add default value to the isAbsolute function of utils | 2024-05-09 | REVIEW_REQUIRED | cosmetic | isAbsolute default |
| [#5662](https://github.com/expressjs/express/pull/5662) | WIP: release process ascii diagram | 2024-05-13 | REVIEW_REQUIRED, draft | maintainer-draft | release diagram |
| [#5856](https://github.com/expressjs/express/pull/5856) | feat(response): new setting strict status codes | 2024-08-23 | CHANGES_REQUESTED | needs-work | strict status codes setting; maintainers prefer no new config |
| [#5901](https://github.com/expressjs/express/pull/5901) | allow overwrite of req.query on subsequent query parser middleware use | 2024-09-03 | REVIEW_REQUIRED | stalled | query middleware overwrite |
| [#6047](https://github.com/expressjs/express/pull/6047) | Fix inheritance should not overwrite the methods on res and req with the ones from http.ServerResponse and http.IncomingMessage | 2024-10-13 | REVIEW_REQUIRED | needs-work | keep non-Node req/res methods; Wes asked for description |
| [#6086](https://github.com/expressjs/express/pull/6086) | Enhance req.acceptsEncodings | 2024-10-25 | CHANGES_REQUESTED | needs-work | acceptsEncodings |
| [#6101](https://github.com/expressjs/express/pull/6101) | Refactor req.is for cleaner argument handling | 2024-10-29 | CHANGES_REQUESTED | cosmetic | req.is refactor |
| [#6110](https://github.com/expressjs/express/pull/6110) | chore: add pull request template | 2024-10-31 | APPROVED | approved-stalled | PR template; org-level template preferred |
| [#6113](https://github.com/expressjs/express/pull/6113) | deps: upgrade cookie, cookie-parser and cookie-session | 2024-10-31 | CHANGES_REQUESTED | needs-work | cookie deps; split per dep |
| [#6118](https://github.com/expressjs/express/pull/6118) | deps: upgrade eslint | 2024-10-31 | REVIEW_REQUIRED | blocked | eslint upgrade; linter decision pending (TC[#327](https://github.com/expressjs/express/pull/327)) |
| [#6126](https://github.com/expressjs/express/pull/6126) | Refactor: streamline method assignment in app | 2024-11-03 | REVIEW_REQUIRED | cosmetic | arrow functions |
| [#6133](https://github.com/expressjs/express/pull/6133) | docs: update JSDoc for req.host getter | 2024-11-03 | CHANGES_REQUESTED | needs-work | req.host JSDoc |
| [#6136](https://github.com/expressjs/express/pull/6136) | Refactor: improve query parsing logic and update JSDoc | 2024-11-03 | REVIEW_REQUIRED | cosmetic | query refactor |
| [#6138](https://github.com/expressjs/express/pull/6138) | Refactor: simplify req.acceptsCharsets with spread syntax | 2024-11-04 | REVIEW_REQUIRED | cosmetic | acceptsCharsets spread |
| [#6139](https://github.com/expressjs/express/pull/6139) | Refactor: simplify req.acceptsEncodings with spread syntax | 2024-11-04 | CHANGES_REQUESTED | cosmetic | acceptsEncodings spread |
| [#6140](https://github.com/expressjs/express/pull/6140) | Refactor req.accepts to utilize rest parameters for better argument handling | 2024-11-04 | APPROVED | cosmetic-approved | accepts spread; approved, cosmetic |
| [#6145](https://github.com/expressjs/express/pull/6145) | Update index.js | 2024-11-05 | REVIEW_REQUIRED | stalled | downloads example comment |
| [#6153](https://github.com/expressjs/express/pull/6153) | Update obsolete code of index.js of example "online" | 2024-11-07 | CHANGES_REQUESTED | needs-work | online example |
| [#6286](https://github.com/expressjs/express/pull/6286) | fix: update online example to support Redis v4+ and remove outdated dependency | 2025-01-19 | CHANGES_REQUESTED, draft | needs-work | online example |
| [#6306](https://github.com/expressjs/express/pull/6306) | Test for  view.prototype.render | 2025-01-31 | CHANGES_REQUESTED | needs-work | view tests; Wes found self-fulfilling assertions |
| [#6382](https://github.com/expressjs/express/pull/6382) | feat: Moving types into the repo | 2025-03-09 | REVIEW_REQUIRED | blocked | types in repo; TS WG undecided |
| [#6404](https://github.com/expressjs/express/pull/6404) | feat(res.redirect): add validation for url and status arguments | 2025-03-18 | REVIEW_REQUIRED | maintainer-6.x | redirect argument validation |
| [#6412](https://github.com/expressjs/express/pull/6412) | docs: include a dependencies navigator | 2025-03-23 | REVIEW_REQUIRED | moved | deps navigator doc |
| [#6480](https://github.com/expressjs/express/pull/6480) | add ESLint pre-commit hook to enforce code quality | 2025-04-23 | REVIEW_REQUIRED | blocked | husky pre-commit; linter decision pending |
| [#6689](https://github.com/expressjs/express/pull/6689) | chore: improve regexes in examples | 2025-08-04 | REVIEW_REQUIRED | stalled | example regex ReDoS |
| [#6703](https://github.com/expressjs/express/pull/6703) | test: enhance req.is() tests with additional cases | 2025-08-12 | REVIEW_REQUIRED | maintainer | req.is tests |
| [#6742](https://github.com/expressjs/express/pull/6742) | feat: dump bodies of get/head reqs | 2025-09-05 | REVIEW_REQUIRED, draft | draft | dump GET/HEAD bodies (perf-wg[#57](https://github.com/expressjs/express/pull/57)) |
| [#6758](https://github.com/expressjs/express/pull/6758) | fix: display the correct message when passing a 'bigint' to 'res.status'. | 2025-09-13 | CHANGES_REQUESTED | needs-work | BigInt status message |
| [#6786](https://github.com/expressjs/express/pull/6786) | Update in changelog (History.md) wrt pillarjs/send/HISTORY.md | 2025-09-24 | REVIEW_REQUIRED | stalled | History.md |
| [#6800](https://github.com/expressjs/express/pull/6800) | refactor: modernize View#lookup | 2025-10-01 | REVIEW_REQUIRED | cosmetic | View#lookup modernise |
| [#6856](https://github.com/expressjs/express/pull/6856) | test: fix static file tests for supertest 7+ URL normalization | 2025-10-25 | CHANGES_REQUESTED | superseded | supertest 7; superseded by [#7600](https://github.com/expressjs/express/pull/7600) |
| [#6865](https://github.com/expressjs/express/pull/6865) | Remove direct 'qs' dependency | 2025-10-29 | REVIEW_REQUIRED | stalled | remove qs dependency; overlaps TC[#511](https://github.com/expressjs/express/pull/511) |
| [#6875](https://github.com/expressjs/express/pull/6875) | fix(res): handle null maxAge gracefully in res.cookie() and updated the dependency "cookie" to the 1.0.2 latest version | 2025-11-02 | REVIEW_REQUIRED | needs-work | cookie maxAge null; maintainer says it self-introduces a regression |
| [#6884](https://github.com/expressjs/express/pull/6884) | res: include Access-Control-Allow-Origin when generating ETag | 2025-11-07 | REVIEW_REQUIRED | rejected-direction | ETag includes ACAO; krzysdz: not Express's job |
| [#6892](https://github.com/expressjs/express/pull/6892) | test: add test for req.host with comma-separated X-Forwarded-Host | 2025-11-10 | REVIEW_REQUIRED | stalled | X-Forwarded-Host test |
| [#6893](https://github.com/expressjs/express/pull/6893) | test: add test for ignoring comma-separated X-Forwarded-Host when trust proxy disabled | 2025-11-10 | REVIEW_REQUIRED | stalled | X-Forwarded-Host test |
| [#6912](https://github.com/expressjs/express/pull/6912) | update to eslint 9 | 2025-11-24 | CHANGES_REQUESTED | blocked | eslint 9; linter decision pending |
| [#6959](https://github.com/expressjs/express/pull/6959) | feat: add diagnostics_channel support for request lifecycle, middleware, and route events | 2025-12-27 | REVIEW_REQUIRED | stalled | diagnostics_channel (lifecycle) |
| [#6970](https://github.com/expressjs/express/pull/6970) | chore(ci): npm-publish via reusable workflows | 2026-01-03 | REVIEW_REQUIRED, draft | maintainer-draft | npm publish workflow |
| [#6982](https://github.com/expressjs/express/pull/6982) | feat: add stable error codes to errors thrown by Express | 2026-01-10 | REVIEW_REQUIRED | maintainer | error codes; Ulises pushed commits 2026-10 |
| [#6993](https://github.com/expressjs/express/pull/6993) | fix: prefer Referer header over Referrer | 2026-01-17 | REVIEW_REQUIRED | maintainer-6.x | prefer Referer |
| [#6994](https://github.com/expressjs/express/pull/6994) | Prevent ETag generation when Cache-Control: no-store is set | 2026-01-17 | CHANGES_REQUESTED | needs-work | skip ETag on no-store |
| [#7008](https://github.com/expressjs/express/pull/7008) | perf: cache accepts instance on request object | 2026-02-01 | REVIEW_REQUIRED | needs-work | cache accepts; asked for numbers |
| [#7035](https://github.com/expressjs/express/pull/7035) | fix: prevent Content-Type header from being set to 'false' | 2026-02-14 | REVIEW_REQUIRED | stalled-good | Content-Type "false" (5.x-safe) |
| [#7038](https://github.com/expressjs/express/pull/7038) | test: add unit tests for compileQueryParser, compileTrust, and normalizeTypes | 2026-02-18 | REVIEW_REQUIRED | stalled | utils tests |
| [#7041](https://github.com/expressjs/express/pull/7041) | feat: add diagnostics_channel support for app initialization | 2026-02-19 | REVIEW_REQUIRED | stalled | diagnostics_channel (init) |
| [#7045](https://github.com/expressjs/express/pull/7045) | fix: non standard status code will result in undefined | 2026-02-20 | REVIEW_REQUIRED | stalled | non-standard status message |
| [#7050](https://github.com/expressjs/express/pull/7050) | Improve test coverage for 'res.set()' edge cases | 2026-02-21 | REVIEW_REQUIRED | stalled | res.set tests |
| [#7051](https://github.com/expressjs/express/pull/7051) | fix: make view engine extension matching case-insensitive | 2026-02-21 | REVIEW_REQUIRED | stalled | case-insensitive engine ext |
| [#7059](https://github.com/expressjs/express/pull/7059) | refactor(deps): migrate connect-redis from v8 to v9 | 2026-02-23 | REVIEW_REQUIRED | stalled | connect-redis example dep |
| [#7061](https://github.com/expressjs/express/pull/7061) | refactor(deps): migrate express-session from v1.18.1 to v1.19.0 | 2026-02-23 | REVIEW_REQUIRED | stalled | express-session example dep |
| [#7092](https://github.com/expressjs/express/pull/7092) | fix: replace deprecated module.parent with require.main === module in… | 2026-03-09 | REVIEW_REQUIRED | stalled | examples module.parent |
| [#7113](https://github.com/expressjs/express/pull/7113) | Fix issue #5995, added cookie encryption | 2026-03-18 | REVIEW_REQUIRED | stalled | cookie encryption |
| [#7117](https://github.com/expressjs/express/pull/7117) | Fix query parameter truncation with configurable limit (fixes #5878) | 2026-03-21 | REVIEW_REQUIRED | needs-work | query limit setting; krzysdz objections |
| [#7119](https://github.com/expressjs/express/pull/7119) | clarify express-generator is still 4.x | 2026-03-21 | REVIEW_REQUIRED | stalled | generator note |
| [#7130](https://github.com/expressjs/express/pull/7130) | fix: handle BigInt status codes in res.status() and res.sendStatus() | 2026-03-26 | REVIEW_REQUIRED | duplicate | BigInt status (dup of [#6758](https://github.com/expressjs/express/pull/6758)) |
| [#7142](https://github.com/expressjs/express/pull/7142) | fix: add path containment check in View.prototype.lookup() | 2026-03-31 | REVIEW_REQUIRED | rejected-direction | view path containment; triager: working as designed |
| [#7146](https://github.com/expressjs/express/pull/7146) | fix(res.set): remove implicit mime lookup and charset injection for Content-Type    | 2026-04-01 | REVIEW_REQUIRED | 6.x-candidate | remove res.set magic |
| [#7151](https://github.com/expressjs/express/pull/7151) | fix: keep repeated extended query params as arrays beyond 20 values | 2026-04-01 | REVIEW_REQUIRED | discussion | extended query arrays >20; TC[#511](https://github.com/expressjs/express/pull/511) |
| [#7161](https://github.com/expressjs/express/pull/7161) | fix: fall back to JSON when JSONP callback sanitizes to empty | 2026-04-04 | REVIEW_REQUIRED | stalled-good | JSONP empty callback |
| [#7275](https://github.com/expressjs/express/pull/7275) | feat: handle circular structure serialization | 2026-05-22 | REVIEW_REQUIRED | stalled | circular JSON |
| [#7283](https://github.com/expressjs/express/pull/7283) | fix: remove implicit Content-Type magic in res.set (#7145) | 2026-05-26 | REVIEW_REQUIRED | duplicate | remove res.set magic (dup of [#7146](https://github.com/expressjs/express/pull/7146)) |
| [#7286](https://github.com/expressjs/express/pull/7286) | fix: normalize all-slash mount paths in app.use to '/' | 2026-05-28 | REVIEW_REQUIRED | stalled-good | normalise '//' mount path |
| [#7317](https://github.com/expressjs/express/pull/7317) | fix: prevent host header injection by sanitizing userinfo in Host header | 2026-06-16 | REVIEW_REQUIRED | maintainer-tc | Host userinfo; on TC agenda, full CI green |
| [#7320](https://github.com/expressjs/express/pull/7320) | fix(res.links): skip empty-array rel values to prevent trailing comma in Link header | 2026-06-17 | REVIEW_REQUIRED | stalled | res.links empty array |
| [#7330](https://github.com/expressjs/express/pull/7330) | fix(req): normalize forwarded protocol casing | 2026-06-24 | REVIEW_REQUIRED | stalled | X-Forwarded-Proto case (labelled 6.x) |
| [#7331](https://github.com/expressjs/express/pull/7331) | fix(req): ignore trailing root dot in subdomains | 2026-06-24 | REVIEW_REQUIRED | stalled | trailing dot in subdomains |
| [#7332](https://github.com/expressjs/express/pull/7332) | fix(res.append): preserve empty header values | 2026-06-24 | REVIEW_REQUIRED | stalled | res.append empty value |
| [#7338](https://github.com/expressjs/express/pull/7338) | │ feat(res): add res.sse() for Server-Sent Events  | 2026-06-29 | REVIEW_REQUIRED | stalled | res.sse() |
| [#7339](https://github.com/expressjs/express/pull/7339) | test: add unit tests for res.contentType alias and parameters in res.type | 2026-06-29 | REVIEW_REQUIRED | stalled | res.type tests |
| [#7351](https://github.com/expressjs/express/pull/7351) | fix(view): handle view names ending with "." to avoid require("") | 2026-07-01 | REVIEW_REQUIRED | stalled-good | view name ending in '.' |
| [#7363](https://github.com/expressjs/express/pull/7363) | fix(res.send): handle raw ArrayBuffer as binary data | 2026-07-06 | REVIEW_REQUIRED | stalled-good | res.send(ArrayBuffer) |
| [#7369](https://github.com/expressjs/express/pull/7369) | docs: mention TypeScript generator options | 2026-07-09 | REVIEW_REQUIRED | stalled | TypeScript generator note |
| [#7387](https://github.com/expressjs/express/pull/7387) | test: cover function-based "trust proxy" hop behavior | 2026-07-20 | REVIEW_REQUIRED | stalled | trust proxy fn tests |
| [#7388](https://github.com/expressjs/express/pull/7388) | docs: fix typos in JSDoc comments | 2026-07-22 | APPROVED | approved-stalled | JSDoc typos; approved 2026-09 |
| [#7392](https://github.com/expressjs/express/pull/7392) | Fix view engine resolution for view names ending in a dot | 2026-07-23 | REVIEW_REQUIRED | duplicate | view name '.' (dup of [#7351](https://github.com/expressjs/express/pull/7351)) |
| [#7395](https://github.com/expressjs/express/pull/7395) | fix(req.get): perform case-insensitive header lookup | 2026-07-25 | REVIEW_REQUIRED | rejected-direction | case-insensitive req.get; parked as 6.x idea |
| [#7396](https://github.com/expressjs/express/pull/7396) | feat: add app-aware router creation | 2026-07-27 | REVIEW_REQUIRED | stalled | app.createRouter |
| [#7407](https://github.com/expressjs/express/pull/7407) | fix(res.redirect): fallback to 'Redirecting' for non-standard status … | 2026-08-06 | REVIEW_REQUIRED | stalled | redirect body for non-standard status |
| [#7408](https://github.com/expressjs/express/pull/7408) | feat(res.send): add BigInt support | 2026-08-06 | REVIEW_REQUIRED | rejected-direction | BigInt in res.send; maintainers: no BigInt support |
| [#7410](https://github.com/expressjs/express/pull/7410) | fix: support raw ArrayBuffer in res.send (#7362) | 2026-08-07 | REVIEW_REQUIRED | duplicate | ArrayBuffer (dup of [#7363](https://github.com/expressjs/express/pull/7363)), conflicting |
| [#7423](https://github.com/expressjs/express/pull/7423) | test: add test cases for null, string, and NaN status codes in res.sendStatus | 2026-08-19 | REVIEW_REQUIRED | stalled | sendStatus tests |
| [#7452](https://github.com/expressjs/express/pull/7452) | Make it clear what arguments 'req.accepts*' functions accept | 2026-09-02 | REVIEW_REQUIRED, draft | maintainer-draft | req.accepts* docs |
| [#7467](https://github.com/expressjs/express/pull/7467) | fix(res.sendFile): treat the app etag setting as a default, not an override | 2026-09-12 | REVIEW_REQUIRED | stalled-good | sendFile etag option regression from [#6073](https://github.com/expressjs/express/pull/6073) |
| [#7470](https://github.com/expressjs/express/pull/7470) | docs: fix parameter name in req.acceptsLanguages JSDoc | 2026-09-15 | REVIEW_REQUIRED | stalled | JSDoc param name |
| [#7479](https://github.com/expressjs/express/pull/7479) | fix: acceptParams truncates quoted values containing a semicolon | 2026-09-19 | REVIEW_REQUIRED | stalled | acceptParams quoted ';' |
| [#7481](https://github.com/expressjs/express/pull/7481) | perf: memoise the Content-Type resolution in res.set, res.type and setCharset | 2026-09-20 | REVIEW_REQUIRED | stalled | memoise Content-Type |
| [#7485](https://github.com/expressjs/express/pull/7485) | fix(res.send): add Content-Length only if Transfer-Encoding is not present | 2026-09-24 | none | stalled | 4.x backport Content-Length vs TE |
| [#7495](https://github.com/expressjs/express/pull/7495) | fix(security): Stored XSS in online example via unescaped User-Agent rendered into the visitor list | 2026-09-29 | REVIEW_REQUIRED | stalled | XSS in online example |
| [#7496](https://github.com/expressjs/express/pull/7496) | fix(security): Prototype-pollution write via __proto__ route param in route-separation user loader | 2026-09-29 | REVIEW_REQUIRED | stalled | proto pollution in example |
| [#7501](https://github.com/expressjs/express/pull/7501) | fix(app.listen): remove the listen error handler after a successful start | 2026-10-02 | REVIEW_REQUIRED | needs-work | app.listen error listener; CI fails on old Node |
| [#7508](https://github.com/expressjs/express/pull/7508) | fix(res.redirect): avoid Content-Length with Transfer-Encoding | 2026-10-06 | REVIEW_REQUIRED | stalled-good | redirect Content-Length vs TE; full CI green |
| [#7511](https://github.com/expressjs/express/pull/7511) | fix(res.send): preserve DataView byte ranges | 2026-10-07 | REVIEW_REQUIRED | stalled-good | DataView bytes |
| [#7515](https://github.com/expressjs/express/pull/7515) | perf: skip content-type re-parse in setCharset for utf-8 | 2026-10-09 | REVIEW_REQUIRED | stalled | setCharset fast path |
| [#7516](https://github.com/expressjs/express/pull/7516) | perf: set default html and json content types directly | 2026-10-09 | REVIEW_REQUIRED | stalled | default content types |
| [#7517](https://github.com/expressjs/express/pull/7517) | perf: cache parsed req.query per request | 2026-10-09 | REVIEW_REQUIRED | stalled | cache req.query |
| [#7519](https://github.com/expressjs/express/pull/7519) | perf: cache trust proxy lookups in req.ip, protocol and host | 2026-10-09 | REVIEW_REQUIRED | stalled | cache trust proxy lookups |
| [#7526](https://github.com/expressjs/express/pull/7526) | docs: fix req.query JSDoc return type | 2026-10-17 | REVIEW_REQUIRED | stalled | req.query JSDoc |
| [#7531](https://github.com/expressjs/express/pull/7531) | feat: add app.listRoutes with sub-application support | 2026-10-17 | REVIEW_REQUIRED | maintainer | app.listRoutes; depends on [router#174](https://github.com/pillarjs/router/pull/174) |
| [#7533](https://github.com/expressjs/express/pull/7533) | fix(req.subdomains): do not split IPv6 hosts that contain dots | 2026-10-20 | REVIEW_REQUIRED | stalled-good | IPv6 subdomains |
| [#7534](https://github.com/expressjs/express/pull/7534) | docs(res.sendFile): use res.status() in the example | 2026-10-21 | REVIEW_REQUIRED | stalled | sendFile JSDoc example |
| [#7539](https://github.com/expressjs/express/pull/7539) | docs: capitalize Express.js project name | 2026-10-21 | REVIEW_REQUIRED | duplicate | README capitalisation (identical [#7528](https://github.com/expressjs/express/pull/7528) closed) |
| [#7541](https://github.com/expressjs/express/pull/7541) | fix(res.render): do not mutate the options object | 2026-10-21 | REVIEW_REQUIRED | stalled-good | render does not mutate options; full CI green |
| [#7542](https://github.com/expressjs/express/pull/7542) | fix(response): send raw bytes of non-Uint8Array typed arrays in res.send() | 2026-10-22 | REVIEW_REQUIRED | duplicate | typed arrays (overlaps [#7574](https://github.com/expressjs/express/pull/7574)) |
| [#7546](https://github.com/expressjs/express/pull/7546) | test: cover zero maxAge cookie expiry | 2026-10-22 | REVIEW_REQUIRED | stalled | cookie maxAge 0 test |
| [#7548](https://github.com/expressjs/express/pull/7548) | [TASK] Update to mocha 12.x | 2026-10-23 | REVIEW_REQUIRED | duplicate | mocha 12 (dup of [#7557](https://github.com/expressjs/express/pull/7557)) |
| [#7555](https://github.com/expressjs/express/pull/7555) | perf: skip the req/res prototype switch for app.listen() | 2026-10-24 | REVIEW_REQUIRED, draft | draft | skip prototype switch |
| [#7557](https://github.com/expressjs/express/pull/7557) | deps: bump mocha to ^12 | 2026-10-24 | REVIEW_REQUIRED | stalled | mocha 12 |
| [#7559](https://github.com/expressjs/express/pull/7559) | fix(res.render): forward send errors from the default callback to next | 2026-10-25 | REVIEW_REQUIRED | stalled-good | render send errors to next |
| [#7561](https://github.com/expressjs/express/pull/7561) | honor sub-app routing settings inheritance | 2026-10-26 | REVIEW_REQUIRED | maintainer-6.x | sub-app settings inheritance tests |
| [#7572](https://github.com/expressjs/express/pull/7572) | test: cover unsatisfiable and invalid ranges in req.range | 2026-10-28 | REVIEW_REQUIRED | stalled | req.range tests |
| [#7573](https://github.com/expressjs/express/pull/7573) | ci: build with node v27 | 2026-10-31 | REVIEW_REQUIRED | waiting | Node 27 CI |
| [#7574](https://github.com/expressjs/express/pull/7574) | fix(res.send): preserve raw bytes of ArrayBuffer views | 2026-10-31 | REVIEW_REQUIRED | stalled-good | ArrayBuffer views (DataView + typed arrays) |
| [#7578](https://github.com/expressjs/express/pull/7578) | fix(res.links): ignore empty object to prevent header corruption | 2026-11-01 | REVIEW_REQUIRED | stalled | res.links empty object |
| [#7593](https://github.com/expressjs/express/pull/7593) | docs: use a cross-platform directory in the Quick Start example | 2026-11-10 | REVIEW_REQUIRED | stalled | README /tmp path |
| [#7600](https://github.com/expressjs/express/pull/7600) | build(deps-dev): bump supertest to ^7.3.2 | 2026-11-17 | REVIEW_REQUIRED | maintainer | supertest 7.3.2 |
| [#7603](https://github.com/expressjs/express/pull/7603) | Support request-aware JSON replacers | 2026-11-21 | REVIEW_REQUIRED | new | request-aware JSON replacer |

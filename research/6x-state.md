# State of Express 6 (as of 2026-11-21)

Sources: the local clone at `~/Dev/express` (remote `upstream` = expressjs/express, fetched; `upstream/master` is `43fca52d`, identical to live GitHub `master` when checked), the raw dumps in `research/raw/`, and read-only `gh` calls. Merge-conflict checks were run with `git merge-tree` in a throwaway bare repo in the session scratchpad, never in `~/Dev/express`. Nothing was posted, pushed or changed on GitHub.

## Summary

- **Nothing about Express 6 is agreed yet.** The "Agreed to be part of Express 6.x" section of the backlog issue still says "_none yet_", and it was last edited 2025-08-27 (https://github.com/expressjs/discussions/issues/267). The Long Term Support decision record still lists 6.x as "TBD" (https://github.com/expressjs/discussions/blob/master/docs/adr/352-lts-strategy.md).
- **There is no 6.x branch.** Upstream has `4.x`, `5.0`, `5.x` and `master`, but no `6.x` or `6.0` (checked with `gh api repos/expressjs/express/branches`). That's why every 6.x pull request targets `master`, which is still the 5.x line: `v5.3.0` is commit `cf6722bf` (2026-10-09), and `master` is 7 commits past it. Maintainers have said they will "re-target when we are ready" (wesleytodd, https://github.com/expressjs/express/issues/6391).
- **The only concrete 6.x work is six exploratory pull requests by Ulises Gascon, all opened 2026-10-23** (https://github.com/expressjs/express/pull/7549 to https://github.com/expressjs/express/pull/7554). Each one is a single commit on a `ulises/6x-*` branch. None has an approval. One has a blocking review (X-Powered-By, -1 from bjohansebas), and one has an open question from a committer (NODE_ENV, krzysdz). The body of https://github.com/expressjs/express/pull/7549 says "Exploratory PR for the 6.x line, parked until the major is consolidated." CI is green on all six. https://github.com/expressjs/express/pull/7550 conflicts with `master`.
- **Every pair of these six pull requests conflicts, at least in `History.md`.** Each adds its own "Unreleased Changes" header. Some pairs also clash in real code: env + X-Powered-By in `lib/application.js`; body-parser + serve-static in `lib/express.js`, `test/exports.js` and two examples.
- **Older 6.x-labeled work is scattered:** 11 more open pull requests and 9 open issues carry the `6.x` label, some dating from 2014 or 2015. Five of the eight links in the backlog issue were closed in 2024: four because their base branch was deleted, one by decision. None was re-filed except the body-parser generic parser.
- **The 6.x project boards are private.** Projects 5 and 7 return 404 to an anonymous visitor. The only public expressjs project is number 9, "Perf WG Tooling". The proposal to make the boards public (https://github.com/expressjs/discussions/issues/512) has sat on every TC agenda since July with 0 comments.
- **No 6.x pull request is on the next TC agenda** (2026-11-23, https://github.com/expressjs/discussions/issues/537). The only Express pull request on it is https://github.com/expressjs/express/pull/7317 (Host header).
- **Dependencies:** router 2.3.0 (2026-11-17) still uses `path-to-regexp ^8.0.0`. Meanwhile path-to-regexp 9.0.0 (2026-10-22) is ESM-only, needs Node 22 or newer, and changes how ambiguous matches resolve. No backlog item covers adopting it. body-parser has a `3.0` milestone with 7 open items. router has a `v3.x` label with one approved pull request.
- **Watch out for maintainer pushback on automated or LLM pull requests.** krzysdz wrote "You and other LLM users and bots have opened PRs adding tests checking the deprecation warning. Please don't." (https://github.com/expressjs/express/issues/6941). bjohansebas closed https://github.com/expressjs/express/pull/7571 with "Please don't open PRs to address that deprecation." jonchurch declined to assign https://github.com/expressjs/express/issues/6951 to anyone outside the core team while it is "in the discussion phase".

## Branches and PRs

### Branch table

"Ahead" and "behind" are counted against `upstream/master` (`43fca52d`). "Clean" means `git merge-tree` against `master` reports no conflict.

| Branch | Commit(s) | Last commit | Ahead / behind | Pull request | Merges into master? | State |
|---|---|---|---|---|---|---|
| ulises/6x-env-production-default | `1f8293f2` | 2026-10-23 | 1 / 4 | https://github.com/expressjs/express/pull/7549 | clean | Complete code; exploratory; open question from krzysdz |
| ulises/6x-node-24 | `5d1e25b2` | 2026-10-23 | 1 / 4 | https://github.com/expressjs/express/pull/7552 | clean | Complete; author notes Node 27 must be added to CI |
| ulises/6x-remove-body-parser | `256d8526` | 2026-10-23 | 1 / 4 | https://github.com/expressjs/express/pull/7550 | **conflict in `package.json`** | Needs rebase onto `43fca52d` (body-parser `^2.4.0`) |
| ulises/6x-remove-serve-static | `8ede5d7f` | 2026-10-23 | 1 / 4 | https://github.com/expressjs/express/pull/7551 | clean | Complete; exploratory |
| ulises/6x-remove-x-powered-by | `c93470b9` | 2026-10-23 | 1 / 4 | https://github.com/expressjs/express/pull/7554 | clean | Blocked: changes requested (bjohansebas) |
| ulises/6x-res-send-no-json | `6a37d6fc` | 2026-10-23 | 1 / 4 | https://github.com/expressjs/express/pull/7553 | clean | Complete; exploratory |
| test/subapp-routing-settings-inheritance | `9e4f86a1` | 2026-10-26 | 1 / 3 | https://github.com/expressjs/express/pull/7561 (labeled 6.x) | clean | Tests only, describing behavior not built yet; CI red |
| feat/list-routes-subapps | `7863c9fb`, `2d3d0134`, `5ebf19ad` | 2026-11-19 | 3 / 4 | https://github.com/expressjs/express/pull/7531 | clean | 5.x feature (`app.listRoutes`), active; not 6.x |
| fix/hostname-host-header-injection | `f556b0b8` | 2026-06-15 | 1 / 33 | https://github.com/expressjs/express/pull/7317 | clean | 5.x security fix; on the 2026-11-23 TC agenda; not 6.x |
| feat/fresh-query-method | `2c926237`, `7bf8671d` | 2026-07-12 | 2 / 30 | https://github.com/expressjs/express/pull/7366 (merged) | n/a | Done: squash-merged as `ae6dd376`; branch is a leftover |
| throw-redirect | `f636741b`, `3981e295` | 2025-03-18 | 2 / 149 | https://github.com/expressjs/express/pull/6404 (labeled 6.x) | **conflict in `lib/response.js`** | Stale; needs rebase over the 5.x deprecation `c5b8d55a` |
| bsebas/check-first-referer | `28cb20ec` | 2026-01-16 | 1 / 69 | https://github.com/expressjs/express/pull/6993 (labeled 6.x) | clean | Waiting on review ("awaiting reviewer" label) |
| req.is | `786fbf41`, `a865e540` | 2025-08-12 | 2 / 110 | https://github.com/expressjs/express/pull/6703 | **conflict in `test/req.is.js`** | Tests-only cleanup; stale; not 6.x |
| defineProperties-vs-defineProperty | `07b2eb3d` | 2025-12-18 | 1 / 82 | none | **conflict in `lib/request.js`** | Experiment: rewrites the request getters with `Object.defineProperties` (279+/253-); abandoned |
| ulises/5x-sec-policy | `f881be52` | 2025-06-13 | 1 / 135 | https://github.com/expressjs/express/pull/6571 (closed) | n/a | Dead: the docs moved to expressjs/.github in `52872b84` |
| ulises/release-dependencies | `639d0049` | 2025-03-23 | 1 / 146 | https://github.com/expressjs/express/pull/6412 | **modify/delete conflict** | Dead in this repo: `Release-Process.md` was deleted by `52872b84` (moved to discussions) |

Two more branches have no 6.x meaning: `ci-workflows` (`762ecae1`, https://github.com/expressjs/express/pull/6970) and `release-branch-diagram` (`a302c9aa`, a work-in-progress from 2024, https://github.com/expressjs/express/pull/5662).

All six `ulises/6x-*` branches start from `0dee2c52` (2026-10-17). Since then `master` has gained `1c6f1b0f` (tests), `bcc0551c` and `6389ae5e` (dependency bumps) and `43fca52d` (body-parser `^2.4.0`).

### Pull request table (the six 6.x PRs and PR 7561)

| PR | Approvals | Blocking reviews | Comments / questions | CI (`gh pr checks`) | Mergeable |
|---|---|---|---|---|---|
| https://github.com/expressjs/express/pull/7549 env defaults to production | 0 | none | krzysdz (2026-10-27): "I could get behind "production" being the default mode/env, but what benefit is there from ignoring NODE_ENV?", unanswered | 30 pass | yes |
| https://github.com/expressjs/express/pull/7550 remove body-parser re-exports | 0 | none | only the author's "If we agree on this approach... then I can prepare a deprecation warning for express@5" | 30 pass | **no: conflicts** |
| https://github.com/expressjs/express/pull/7551 remove serve-static re-export | 0 | none | same author note only | 30 pass | yes |
| https://github.com/expressjs/express/pull/7552 Node.js 24 minimum | 0 | none | author's own review note: "We will need to include 27 once is ready"; body: "I assume that we won't ship express@6 until May'27, otherwise 22 is the way to go" | 20 pass (smaller test matrix) | yes |
| https://github.com/expressjs/express/pull/7553 res.send() stops turning objects into JSON | 0 | none | same author note; 1 thumbs-up | 30 pass | yes |
| https://github.com/expressjs/express/pull/7554 remove X-Powered-By | 0 | **changes requested by bjohansebas (2026-10-23): "-1 on this. Why remove it? Though I also wonder why we should keep it."** | Phillip9587 quoted helmet's view that the header has "very limited security benefits". In 2015 dougwilson refused this change "as long as PHP, ASP.Net and others are sending X-Powered-By by default" (https://github.com/expressjs/express/pull/2813). A third-party bot ("code-check", subhiandrews, 2026-11-19) noted there is no test that the header is gone | 30 pass | yes, but blocked |
| https://github.com/expressjs/express/pull/7561 sub-app routing settings inheritance | 0 | none | Body: "not solving the problem (for now) just documenting the breaking change". yxshee ran it: 8 of 14 tests fail. The code-check bot rated it critical (suite not skipped) and warned that the "conflicting settings" test locks in an API nobody has decided on | **22 fail**, 6 pass, 2 skipped | yes |

No reviewer has been requested on any of them. `reviewRequests` is empty and `mergeStateStatus` is `BLOCKED` (or `DIRTY` for 7550).

### Conflicts between the six 6.x PRs

From `git merge-tree` on each pair:

- **All 15 pairs** conflict in `History.md`. Each branch inserts its own `# Unreleased Changes` / `## ⚠️ Breaking changes` header above `5.3.0`.
- **env (7549) + X-Powered-By (7554):** also conflict in `lib/application.js`. Both edit the first lines of `app.defaultConfiguration`.
- **body-parser (7550) + serve-static (7551):** also conflict in `lib/express.js`, `test/exports.js`, `examples/mvc/index.js` and `examples/route-separation/index.js`. Both touch the "Expose middleware" block and the same examples.
- **body-parser (7550) + master:** conflicts in `package.json`. `master` moved body-parser to `^2.4.0` in `43fca52d`, and the branch also still lists `^2.3.0` in devDependencies.
- **Outside the six:** https://github.com/expressjs/express/pull/6865 (remove the direct `qs` dependency, labeled 6.x) conflicts with both `master` and 7550 in `History.md` and `package.json`. https://github.com/expressjs/express/pull/7553 merges cleanly with the open 5.x `res.send` byte fixes https://github.com/expressjs/express/pull/7574 and https://github.com/expressjs/express/pull/7542.

The fix is simple: once a 6.x branch exists, land the changes one by one and rebase each time, keeping a single "Unreleased Changes" section.

### What each 6.x branch changes

**PR 7549: env defaults to production (`1f8293f2`).**
- `lib/application.js` drops `process.env.NODE_ENV || 'development'` and always sets `env` to `'production'`. It also enables `view cache` unconditionally.
- Effect: the default error handler (finalhandler, which receives `env`) stops sending stack traces unless the app calls `app.set('env', 'development')`.
- The test suite used to depend on `NODE_ENV=test`. `test/support/env.js` now wraps `defaultConfiguration` so every test app gets `env = 'test'`, and three examples switch from `process.env.NODE_ENV` to `app.get('env')`.
- Old request: https://github.com/expressjs/express/issues/3346 (2017). There, dougwilson recorded in 2022 that the "general consensus was to change the default to production … eventually removing the magic environment stuff".
- Open questions: ignoring `NODE_ENV` entirely (krzysdz). Turning on `view cache` by default even during development, which nobody has discussed. A 5.x deprecation step, not written yet.

**PR 7550: remove the body-parser re-exports (`256d8526`).**
- Removes `express.json`, `express.raw`, `express.text` and `express.urlencoded`, and moves `body-parser` to devDependencies.
- Deletes about 2,660 lines of parser tests (`test/express.json.js`, `express.raw.js`, `express.text.js`, `express.urlencoded.js`). Four examples now require `body-parser` directly.
- Needs a rebase.
- Nobody has discussed it yet. It touches the most-used Express 5 API (`express.json()`), so the TC will likely want a deprecation step and a codemod.

**PR 7551: remove the serve-static re-export (`8ede5d7f`).**
- Removes `express.static`, moves `serve-static` to devDependencies, deletes `test/express.static.js` (815 lines) and updates five examples.
- Same open question as 7550.

**PR 7552: Node.js 24 minimum (`5d1e25b2`).**
- Sets `engines.node` to `>= 24` and updates the Readme.
- The CI matrix goes from 18 to 26 down to 24, 25 and 26. The "legacy" workflow, which tests below the supported floor, moves from Node 16/17 to 18/20/22.
- Tension with policy: the Long Term Support decision record says "Dropping old Node.js versions alone is not enough of a breaking change", and the LTS strategy says support removal "must come with clear benefits" and "is not dropped on a merely time-based basis" (https://github.com/expressjs/discussions/blob/master/docs/LTS-strategy.md).
- The pull request only argues end-of-life dates. The Node.js version policy decision record that https://github.com/expressjs/discussions/issues/236 asks for still doesn't exist (wesleytodd, 2025-08-18: "We need that ADR").
- A concrete benefit it could cite: path-to-regexp 9 and the ESM plans both need Node 22.12 or newer (see "Dependencies planned for 6.x").

**PR 7553: res.send() stops serializing objects (`6a37d6fc`).**
- `res.send` now accepts only a string, `Buffer`, `ArrayBufferView`, `null` or `undefined`. Objects, arrays, numbers and booleans throw a `TypeError` that says to use `res.json()`.
- 17 files change, mostly tests that used `res.send(obj)`. Two examples switch to `res.json`.
- Closes https://github.com/expressjs/express/issues/2249, which dougwilson opened in 2014 with the plan "deprecate … after 5.0 is released so it would be scheduled for removal in a 6.0". That 5.x deprecation has not been written.

**PR 7554: remove X-Powered-By (`c93470b9`).**
- Deletes the `x-powered-by` default setting and the header write in `app.handle`.
- Only removes `app.disable('x-powered-by')` lines from two tests. There is no test that the header is gone.
- Disputed: see the pull request table above.

**PR 7561: sub-app routing settings inheritance (`9e4f86a1`).**
- 168 lines of tests in `test/app.router.js` for the breaking change described in the merged website pull request https://github.com/expressjs/expressjs.com/pull/2550, which documents the current timing.
- Related to https://github.com/expressjs/express/issues/2564 (originally planned for 5.x).
- There is no implementation, and the author says it is still undecided whether the change belongs in Express or in router.

### Other open pull requests labeled 6.x

| PR | What it does | Status |
|---|---|---|
| https://github.com/expressjs/express/pull/6404 | `res.redirect` throws on a missing or invalid url or status | By bjohansebas (listed as a triager in the Readme, with push access: the `throw-redirect` branch is his). Its 5.x deprecation already landed in `c5b8d55a` (https://github.com/expressjs/express/pull/6405). Conflicts with `master`. https://github.com/expressjs/express/pull/7103 was closed as a duplicate of it |
| https://github.com/expressjs/express/pull/6993 | `req.get('referer')` prefers `Referer` over `Referrer` | By bjohansebas. The opposite approach, deprecating Referrer (https://github.com/expressjs/express/pull/4106), was closed 2026-07-25 after wesleytodd said it "will be very noisy" |
| https://github.com/expressjs/express/pull/6865 | Removes the direct `qs` dependency and drops the built-in `extended` query parser | Depends on the disputed https://github.com/expressjs/discussions/issues/511. Conflicts with `master` |
| https://github.com/expressjs/express/pull/6875 | `cookie@1` plus `maxAge: null` | efekrskl: the cookie 1.x upgrade "cannot be done until express 6" |
| https://github.com/expressjs/express/pull/7395 | `req.get` looks up header names case-insensitively | krzysdz objects ("Express should not work around problems in code that uses it"). bjohansebas labeled it "an idea for Express 6" |
| https://github.com/expressjs/express/pull/7330 | Lowercases `X-Forwarded-Proto` | No maintainer comments |
| https://github.com/expressjs/express/pull/6101 | `req.is` refactor | Changes requested |
| https://github.com/expressjs/express/pull/5652 | `isAbsolute` default value | ctcpip: "arguably a very minor breaking change" |
| https://github.com/expressjs/express/pull/2738 | `res.links()` accepts arrays | Open since 2015. bjohansebas asked the author to resolve conflicts on 2026-01-16 |
| https://github.com/expressjs/express/pull/3730 | HTTP/2 support | Open since 2018, base branch `5.0`, "needs rebase". The author has asked for someone to take it over |

## Backlog vs reality

Legend: **PR open** = an open pull request implements it. **Branch only** = code exists but no pull request. **Discussed only** = issue or discussion, no code. **Closed / rejected** = closed with no replacement, or a decision against it.

### Items listed in the backlog issue (https://github.com/expressjs/discussions/issues/267) and its comments

| Item | Status | Links and notes |
|---|---|---|
| HTTP/2 support across the stack | Discussed only (plus a stale PR) | https://github.com/expressjs/discussions/issues/407. Per-dependency table: on-finished and router "need changes and tests", others "need investigating". bjohansebas (2026-01-23) still couldn't make webpack-dev-server pass, even with the on-finished changes. skitscha offered help on 2026-10-27; no reply |
| express PR 3730, HTTP/2 | PR open, stale | https://github.com/expressjs/express/pull/3730. Base `5.0`, 2018 code, the author has stepped away |
| express PR 3214, move req/res out of the repo | Closed | https://github.com/expressjs/express/pull/3214. Closed 2024-09-10 when the 5.x base branch was deleted at release; never re-filed |
| express PR 3218, settings moved out of core | Rejected | https://github.com/expressjs/express/pull/3218. On 2024-07-08 the team "decided that we would not land this", to avoid breaking the API twice. The follow-up is https://github.com/expressjs/express/pull/3714 (5.x deprecations, open). wesleytodd says it needs more tests before landing |
| express PR 3213, remove the direct `http` dependency | Closed | https://github.com/expressjs/express/pull/3213. wesleytodd (2024-07-23): "target this for v6". Closed by branch deletion and never re-opened |
| express PR 2648, separate render locals from config | Closed | https://github.com/expressjs/express/pull/2648. wesleytodd's remaining checklist: a deprecation warning for a `locals` key, docs, tests. Then "kick the can to v6". Closed by branch deletion |
| body-parser PR 524, generic parser | Superseded, PR open | Closed 2024-10-16 (branch deletion). The replacement https://github.com/expressjs/body-parser/pull/544 was also closed. Live successor: https://github.com/expressjs/body-parser/pull/696 (Phillip9587, changes requested) |
| on-finished PR 31, socket detach | PR open, stuck | https://github.com/jshttp/on-finished/pull/31. Open since 2019; bjohansebas (2026-01-15) can't get the HTTP/2 test to pass |
| HTTP/2 tests for every direct dependency (bjohansebas comment, 2025-01-15) | Discussed only | Checked on GitHub 2026-11-21: only finalhandler has HTTP/2 tests. router, send, body-parser, serve-static, on-finished, parseurl and proxy-addr have none |
| Logging and diagnostics in v6 (dpopp07 comment) | Discussed only | https://github.com/expressjs/discussions/issues/341 (0 comments), https://github.com/expressjs/discussions/issues/459 (replace `depd`/`debug` with Node built-ins), design pull request https://github.com/expressjs/discussions/pull/509 (`@expressjs/log`, on the TC agenda) |

### Items tracked only by the `6.x` label in expressjs/express

| Item | Status | Links and notes |
|---|---|---|
| `env` defaults to production | PR open | https://github.com/expressjs/express/issues/3346, https://github.com/expressjs/express/pull/7549 |
| `res.send(obj)` stops sending JSON | PR open | https://github.com/expressjs/express/issues/2249, https://github.com/expressjs/express/pull/7553. No 5.x deprecation yet |
| `res.redirect` validation | PR open, 5.x deprecation done | https://github.com/expressjs/express/issues/6391 (closed in favor of the PR), https://github.com/expressjs/express/issues/6941, https://github.com/expressjs/express/pull/6404, deprecation `c5b8d55a` |
| Referer vs Referrer | PR open | https://github.com/expressjs/express/issues/3951, https://github.com/expressjs/express/pull/6993 |
| Sub-app routing settings inheritance | PR open (tests only) | https://github.com/expressjs/express/issues/2564, https://github.com/expressjs/express/pull/7561 |
| Remove the `res.set` Content-Type magic | Discussed only | https://github.com/expressjs/express/issues/7145 (blakeembrey, labeled "ideas, require-triage"). Its author closed the attempt https://github.com/expressjs/express/pull/7430 without any maintainer review |
| Standard error codes | Discussed only (core team) | https://github.com/expressjs/express/issues/6951 |
| ESM | Discussed only, decided against for now | https://github.com/expressjs/express/issues/6739. The ESM decision record says "we will not make a dedicated effort" (https://github.com/expressjs/discussions/blob/master/docs/adr/323-esm-support.md). bjohansebas ties it to the Node version Express 6 picks |
| Node http prototype handling | Discussed only | https://github.com/expressjs/express/issues/3555 |
| HTTP/2 push | Discussed only | https://github.com/expressjs/express/issues/2781 |

### Items proposed in October 2026 that are not in any backlog list

| Item | Status | Links |
|---|---|---|
| Node.js 24 minimum | PR open | https://github.com/expressjs/express/pull/7552, related https://github.com/expressjs/discussions/issues/236 |
| Remove the body-parser re-exports | PR open | https://github.com/expressjs/express/pull/7550 |
| Remove the serve-static re-export | PR open | https://github.com/expressjs/express/pull/7551 |
| Remove X-Powered-By | PR open, disputed | https://github.com/expressjs/express/pull/7554 |
| Remove the `extended` option / `qs` | Discussed, disputed, on the TC agenda | https://github.com/expressjs/discussions/issues/511, https://github.com/expressjs/express/pull/6865 |
| Tidy the settings API | PR open (5.x deprecation) | https://github.com/expressjs/express/pull/3714 |
| cookie 1.x | PR open | https://github.com/expressjs/express/pull/6875 |

### Dependencies planned for 6.x

- **router** (pillarjs/router, current 2.3.0, `path-to-regexp ^8.0.0`, Node 18 or newer):
  - A `v3.x` label exists. The only pull request with it is https://github.com/pillarjs/router/pull/137 (`refactor!`: replace `is-promise` with an `instanceof` check; also drops `depd`). UlisesGascon approved it, and jonkoops rebased it on 2026-10-27, adding "If there is interest in landing a new major, there are more enhancements we could be doing".
  - Next-major ideas in issues: https://github.com/pillarjs/router/issues/129 (stop generating methods from `methods`; provide the main ones statically plus `router.method()`) and https://github.com/pillarjs/router/issues/136 (drop `is-promise`).
  - Express 5 leftovers still open: https://github.com/pillarjs/router/issues/44 (move the OPTIONS responder out) and https://github.com/pillarjs/router/issues/43 (new API for HTTP methods).
  - Older `express-v5` pull requests still open: https://github.com/pillarjs/router/pull/59 (deprecate the arity check), https://github.com/pillarjs/router/pull/75 (returned promise acts like `next`), https://github.com/pillarjs/router/pull/86 (store matched routes).
  - Where sub-app settings inheritance lives (router or Express) is undecided (https://github.com/expressjs/express/pull/7561).
- **path-to-regexp:** v9.0.0 was released 2026-10-22 (https://github.com/pillarjs/path-to-regexp/releases/tag/v9.0.0). It is ESM-only and needs Node 22 or newer. The last parameter is now the greedy one, so `/:file.:ext` on `/foo.json.html` gives `["foo", "json.html"]` instead of `["foo.json", "html"]`. That is a route-matching break for users. **No issue or pull request in router or Express plans to adopt it.** router is CommonJS, so adopting it means either relying on `require(esm)` (Node 22.12 or newer, which a Node 24 floor guarantees) or porting router to ESM.
- **body-parser** (current 2.4.0): the `3.0` milestone (https://github.com/expressjs/body-parser/milestone/2) has 7 open items.
  - https://github.com/expressjs/body-parser/issues/775: decide how invalid options are handled.
  - https://github.com/expressjs/body-parser/pull/710: remove the deprecated `bodyParser()`.
  - https://github.com/expressjs/body-parser/pull/709: remove internal-file exports (approved).
  - https://github.com/expressjs/body-parser/pull/706: non-negative `limit` (changes requested).
  - https://github.com/expressjs/body-parser/pull/678: charset validation refactor.
  - https://github.com/expressjs/body-parser/issues/607: keep the error stack in the JSON parser.
  - https://github.com/expressjs/body-parser/pull/602: stop setting `req.body` to undefined (approved).
  - Also the generic parser (https://github.com/expressjs/body-parser/pull/696) and the `extended`/`qs` question (https://github.com/expressjs/discussions/issues/511).
  - If https://github.com/expressjs/express/pull/7550 lands, body-parser 3.0 stops shipping inside Express, so its timing no longer blocks Express 6.

## Open gaps we could take (ranked)

Criteria: the item is planned or labeled for 6.x (or is a prerequisite), has no pull request, is small and clearly specified, and could land without a 6.x branch existing. Items the TC disputes are listed separately at the end.

1. **HTTP/2 tests for router, send, serve-static and body-parser.**
   - Requested in the backlog itself (bjohansebas, https://github.com/expressjs/discussions/issues/267: "adding tests to all the dependencies that are direct to Express") and in the dependency table of https://github.com/expressjs/discussions/issues/407.
   - None of the four has HTTP/2 tests today. finalhandler does (22 mentions in `test/`), and its tests are a ready pattern to copy.
   - Tests only, no breaking change, so they can land now in each package's current major.
   - Caveat: bjohansebas said "Which is something I want to work on". Ask on https://github.com/expressjs/discussions/issues/407 which packages he hasn't started. Skip media-typer and range-parser: they only parse strings and never touch the request object.
2. **5.x deprecation plus 6.x change for render `locals`** (https://github.com/expressjs/express/pull/2648).
   - The checklist is already written down by wesleytodd: (a) a deprecation warning when a `locals` key is passed to render, (b) docs, (c) tests.
   - Step (a) is a small semver-minor pull request to `master`, using the existing `depd` pattern from `c5b8d55a`.
   - Nobody owns it, and the original pull request was closed only because its branch was deleted.
3. **router 3.x: replace generated HTTP method helpers** (https://github.com/pillarjs/router/issues/129).
   - Clearly specified: main methods defined statically, plus `router.method("METHOD", …)` for the rest. It fixes a known `BIND` vs `.bind` bug class.
   - No pull request exists.
   - Goes into a router major, so first ask the captain whether a `v3.x` branch or milestone is coming (jonkoops asked for a milestone on 2024-11-05 and is offering more major work on https://github.com/pillarjs/router/pull/137).
4. **A plan for path-to-regexp 9 in router 3.x.**
   - Not planned anywhere, and it changes route matching for users, so it needs an issue before code.
   - A concrete, well-scoped issue would help: the user-visible changes (the greedy-parameter flip, trailing-delimiter change) and the ESM-only loading options for CommonJS router under Node 24. It would also supply the "clear benefit" that https://github.com/expressjs/express/pull/7552 currently lacks.
5. **The Node.js version support decision record** (https://github.com/expressjs/discussions/issues/236).
   - The TC says it is the one missing record ("We need that ADR and will leave this open"). The template is at https://github.com/expressjs/discussions/blob/master/docs/adr/000-adr-template.md.
   - Documentation only, but decision records have so far been written by TC members. Offer to draft it, don't just send it.
6. **Swap `depd` for `util.deprecate` in Express 6** (https://github.com/expressjs/discussions/issues/459).
   - Small: `depd` is used only in `lib/response.js:17` on `master`. jonchurch called it "low friction", while the `debug` replacement is contested.
   - Wait for the logging design (https://github.com/expressjs/discussions/pull/509) so `depd` and `debug` are handled together.
   - This needs a 6.x branch, so it can only be parked until one exists.

**Disputed: don't open pull requests for these until the TC decides.**
- X-Powered-By removal: blocking -1 from bjohansebas; rejected by dougwilson in 2015.
- Ignoring `NODE_ENV`: krzysdz's open question on https://github.com/expressjs/express/pull/7549.
- Removing `extended`/`qs`: ljharb against, bjohansebas and 43081j for (https://github.com/expressjs/discussions/issues/511, on the agenda).
- Case-insensitive `req.get`: krzysdz against (https://github.com/expressjs/express/pull/7395).
- Deprecating `Referrer`: "too noisy", closed in https://github.com/expressjs/express/pull/4106.
- Error codes: core team only (https://github.com/expressjs/express/issues/6951).
- ESM: the ESM decision record says no dedicated effort.
- Sub-app settings inheritance: the design (Express or router; throw or stay silent) is open on https://github.com/expressjs/express/pull/7561.
- `res.set` magic (https://github.com/expressjs/express/issues/7145): labeled "ideas, require-triage". Not disputed, but not triaged either.

**Not gaps, though they look like them.**
- Adding tests for the existing `res.redirect` deprecations: maintainers have explicitly asked people to stop (https://github.com/expressjs/express/issues/6941, https://github.com/expressjs/express/pull/7571).
- Writing the 5.x deprecations for PRs 7549, 7550, 7551 and 7553: the author said he would write them himself once the approach is agreed.
- Rebasing https://github.com/expressjs/express/pull/6404 or https://github.com/expressjs/express/pull/7550: both belong to maintainers (bjohansebas, a triager; Ulises Gascon, a TC member per the Readme TC list).

## How a 6.x change lands

1. **Discuss first.**
   - The org contributing guide's steps start with "Create an issue for the bug you want to fix or the feature that you want to add" (https://github.com/expressjs/.github/blob/master/CONTRIBUTING.md).
   - For anything that spans packages, the TC uses expressjs/discussions. To get an item on the TC meeting agenda, it needs the `tc agenda` label there; for the working session, `top priority`. The agenda issues are generated from those labels (example: https://github.com/expressjs/discussions/issues/537).
2. **Target branch.**
   - The guide says "Use the correspondingly named branch, e.g. `6.x`, for anything intended for a future release". The release process says a major goes on a proposal branch named `<major>.0` with a tracking pull request (https://github.com/expressjs/discussions/blob/master/docs/contributing/release-process.md).
   - Neither branch exists for 6. Today, 6.x pull requests target `master`. Maintainers add the `6.x` and `semver-major` labels and the title prefix `[6.x]` (see https://github.com/expressjs/express/pull/7549 to https://github.com/expressjs/express/pull/7554), and they plan to re-target "when we start the branch" (wesleytodd, https://github.com/expressjs/express/issues/6391).
   - Expect to rebase and re-target later.
3. **Deprecate in 5.x first.** This is not written down as a rule, but it is the consistent practice:
   - dougwilson on https://github.com/expressjs/express/issues/2249: deprecate after 5.0 "so it would be scheduled for removal in a 6.0".
   - wesleytodd on https://github.com/expressjs/express/issues/3951: "start with printing a deprecation warning … merge in 5.0 with a removal in 6.0".
   - The `res.redirect` pair: 5.x deprecation `c5b8d55a`, then the 6.x throw in https://github.com/expressjs/express/pull/6404.
   - The 4.x precedents: https://github.com/expressjs/express/pull/5935, https://github.com/expressjs/express/pull/5672 and https://github.com/expressjs/express/pull/4223.
   - Ulises's "then I can prepare a deprecation warning for express@5" on each 6.x pull request.
   - The Long Term Support decision record says CURRENT and ACTIVE lines receive "deprecation notices".
   - In practice: a semver-minor pull request to `master` that calls `deprecate()` (from `depd`, `lib/response.js:17`), plus the separate 6.x pull request that removes the behavior.
4. **Pull request content.**
   - Tests must pass; follow `npm run lint` (standard style); a bug fix needs a test (contributing guide).
   - For 6.x, follow the pattern Ulises set: a `History.md` entry under `# Unreleased Changes` / `## ⚠️ Breaking changes` with before/after code, and examples updated in the same pull request.
   - Breaking changes that users must act on also need website docs (example: https://github.com/expressjs/expressjs.com/pull/2550). No 6.x migration guide exists yet on expressjs.com.
   - Node.js version changes must follow the Long Term Support decision record and the LTS strategy: dropping versions alone doesn't justify a major, and support always overlaps one even-numbered version above the old minimum.
5. **Review and merge rules** (https://github.com/expressjs/discussions/blob/master/docs/GOVERNANCE.md).
   - No merge without review. Non-trivial pull requests sit at least 36 hours.
   - A pull request is accepted once no committer objects.
   - Objections are settled by consensus, and escalated to the TC if needed. The TC seeks consensus and votes only as a last resort.
   - Only package captains or TC members publish releases (release-process doc).
6. **Meeting cadence.**
   - TC meetings run every two weeks on Monday at 18:00 or 19:00 UTC: 2026-10-26 (https://github.com/expressjs/discussions/issues/532), 2026-11-09 (https://github.com/expressjs/discussions/issues/535), next 2026-11-23 (https://github.com/expressjs/discussions/issues/537).
   - Working sessions run in the alternate weeks on Wednesday at 21:00 UTC: 2026-11-04 (https://github.com/expressjs/discussions/issues/534), 2026-11-18 (https://github.com/expressjs/discussions/issues/536).
7. **How 5.0 was run, as the model for 6.0.**
   - A long-lived `5.0` branch with a tracking pull request: https://github.com/expressjs/express/pull/2237, opened 2014-07-14, merged 2024-09-10.
   - A "last push" checklist issue with an owner per item: https://github.com/expressjs/discussions/issues/233. The 6.x backlog issue copies its rules word for word.
   - A dependency-upgrade list: https://github.com/expressjs/discussions/issues/256, which grew out of https://github.com/expressjs/express/issues/4282, "Dependencies (5.0)".
   - The shortcut used to ship: aggressive scope cutting. wesleytodd on 3213 and 2648 in July 2024: "We are trying to aggressively cut scope so we can actually ship v5".
   - For 6.0, the equivalent pieces are missing: no `6.0` branch, no tracking pull request, no owners in issue 267, and the board is private.

## Ranked next steps

1. Watch the 2026-11-23 TC meeting notes (https://github.com/expressjs/discussions/issues/537) for anything on issue 512 (making the project boards public) or issue 511 (`extended`/`qs`). Those decide what's visible and what's in scope.
2. Ask on https://github.com/expressjs/discussions/issues/407 which dependencies still need HTTP/2 tests, then take router or send (gap 1).
3. Open an issue in expressjs/express proposing the render `locals` 5.x deprecation from wesleytodd's checklist (gap 2) before writing code.
4. Ask the router captain on https://github.com/pillarjs/router/issues/129 whether a 3.x line is planned (gaps 3 and 4).
5. Hold off on any pull request that targets 6.x behavior until a `6.x` or `6.0` branch exists, or until the TC moves something into the "Agreed" list of issue 267.

# Express research, 2026-11-21

Fork: https://github.com/abedmurrar/express. The plan built from this research is [`ROADMAP.md`](../ROADMAP.md). We work on the fork only: nothing goes upstream. The raw GitHub dumps (`raw/`) stay out of git; re-create them with `./dump.sh`.

## What's in this folder

| File | What it answers |
|---|---|
| `problems.md` | Every open issue (114), open PR (149) and Discussion (208), grouped and ranked, with 26 local repros |
| `6x-state.md` | What exists for Express 6: branches, PRs, the backlog, gaps, and how a 6.x change lands |
| `forks.md` | 10,326 forks scanned, and what the Express-compatible rewrites do |
| `fastify.md` | What Fastify does better, area by area, with file:line references on both sides |
| `bench/` | Benchmark harness (`run.js`, `server.js`) and `results.json` |
| `repro/` | Bug repro scripts. Run with `node repro/<issue>.js`; each prints a `VERDICT` line |
| `raw/` | The GitHub data as dumped (not committed). Re-dump with `./dump.sh` |
| `appendix-decisions.json`, `build-appendix.js` | Our decision for every open upstream issue and PR, and the script that renders it into `ROADMAP.md` |

## The short version

1. **Express 6 hasn't really started.** The "agreed for 6.x" list in https://github.com/expressjs/discussions/issues/267 still says "none yet". There's no 6.x branch, and `master` is still the 5.x line (5.3.0 was tagged on it). The six `[6.x]` PRs (https://github.com/expressjs/express/pull/7549 to 7554) are parked one-commit experiments, and two of them are disputed.
2. **The bottleneck is review, not code.** 127 of the 149 open PRs have no approval, and many new contributors' PRs have only had the bot checks run. Maintainers have asked people to stop sending bot-style and AI-style PRs. So the ChatGPT plan to "give AI agents tasks and submit PRs" would backfire unless every PR is small, proven, and something they already asked for.
3. **The real bugs are mostly in `res.*` edge cases and the router.** 22 of 26 repros reproduce on master. Examples: `res.send` mangles binary bodies, `res.redirect` sends both length headers, `res.set` sends `Content-Type: false`, and query parsing silently drops every parameter after the first 1,000.
4. **Fastify is about 1.8x faster in every scenario we measured.** The biggest gaps are its radix router, building req/res once instead of swapping prototypes on every request, and not hashing every body for an ETag. Most of Fastify's design (hooks, encapsulation, schemas) can't move into Express without breaking middleware. Those belong in plugins.
5. **Forks are mostly noise.** The only serious one is https://github.com/EriksRemess/express (73 commits ahead, with a static-route index for the router). The uWebSockets.js rewrites (ultimate-express, fulmine.js) are much faster, but each shipped an authorization bypass in its routing fast path. That's the risk to design against.

## Benchmark (this machine, Node 24.17.0)

Median of 3 rounds, 10 seconds each, 50 connections, rotating order. Requests per second:

| Scenario | Express 5.3.0 | master | master + PR 7555 | Fastify 5.12.8 |
|---|---|---|---|---|
| Hello World | 35,175 | 33,776 | 38,419 (+14%) | 61,660 |
| JSON | 30,674 | 30,503 | 34,297 (+12%) | 54,832 |
| 10 middleware | 29,687 | 30,395 | 34,185 (+12%) | 54,969 |
| 100 routes, last one hit | 24,753 | 24,654 | 27,329 (+11%) | 43,516 |

PR 7555 (https://github.com/expressjs/express/pull/7555) led master in every round. Rounds varied by up to about 10%, because research agents were running at the same time. Re-run on a quiet machine before relying on them.

## Security item

When `trust proxy` is a number, Express trusts that many hops (`lib/utils.js:203`). Fastify published GHSA-3m5p-2c4r-xxw2 (medium, 2026-08-18) for X-Forwarded-* spoofing with the same hop-count logic. A client that reaches the app without going through the proxy may be able to spoof `req.protocol` and `req.hostname`. The fix is on the roadmap for our 6.0, with a deprecation warning on the compatible line first.

## What we do with it

Every item is tracked in [`ROADMAP.md`](../ROADMAP.md). Its appendix records a decision for every open upstream issue and PR, built with `node research/build-appendix.js` from `appendix-decisions.json`.

## Patterns upstream maintainers reject (for context)

`*` routes coming back, new `app.set` settings or more qs knobs, magic behaviour, performance PRs without numbers, test-only PRs for existing deprecations, Fastify-style hooks or schemas in core, or anything that is a breaking change in a minor release. The detail is in `problems.md` ("Things maintainers reject") and `6x-state.md`.

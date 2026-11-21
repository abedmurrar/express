# Benchmark comparison

Every PR gets one full run of this benchmark before it counts as done (see `ROADMAP.md`). One run per PR, not per edit.

It compares, under the same load and on the same machine:

| Target | What it is |
|---|---|
| express 5.3.0 (npm) | The original Express, installed as `express-original` |
| base | This repository at `--against` (default `master`), checked out into a temporary worktree |
| head | This repository as it is now, including uncommitted changes |
| fastify, koa, hono, polka | Other frameworks, with their usual defaults |
| node:http | Plain Node doing the same work by hand, as a reference point |

## Scenarios

| Scenario | Request | Work |
|---|---|---|
| `hello` | `GET /` | Send a short text body |
| `json` | `GET /` | Send a small JSON object |
| `params` | `GET /user/abc` | Read a route parameter |
| `mw10` | `GET /` | 10 middleware, each updating per-request state, then text |
| `routes100` | `GET /r99/abc` | 100 parameter routes, hitting the last one |
| `post-json` | `POST /echo` | Parse a JSON body and send it back |
| `not-found` | `GET /nope` | No matching route: 404 |

Before measuring each target and scenario, the harness checks the response (status and body). A framework that answers differently is reported as "check failed" and not measured, so every number compares the same work.

## Running it

```sh
cd ~/Dev/express
npm --prefix benchmarks/compare install
node benchmarks/compare/run.ts                 # full run, about 25 minutes
node benchmarks/compare/run.ts --quick         # 1 round of 3 s, 4 targets: only while iterating
node benchmarks/compare/run.ts --against v5.3.0 --scenarios hello,json
```

Options: `--against <ref>`, `--rounds` (3), `--duration` seconds (5), `--warmup` seconds (2), `--connections` (50), `--targets original,base,head,fastify,koa,hono,polka,node-http`, `--scenarios`, `--name` (the results file name; defaults to the branch), `--keep-base`.

Results go to `benchmarks/results/<branch>.md` and `.json`. Commit both with the PR.

## Keeping the numbers honest

- Run it on an idle machine: no builds, test runs or other benchmarks at the same time. The load average at the start is written into the results.
- On Linux, the server runs on CPUs 0 and 4 (one physical core), and the load generator runs on the other CPUs.
- Targets run in a different order each round, and the median of the rounds is reported.
- Each server gets `--max-old-space-size=256`.
- Everything is strict TypeScript that Node 24 runs directly. Check it with `npm --prefix benchmarks/compare run typecheck`.

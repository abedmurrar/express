# Instruction count

A speed gate that runs on every pull request that changes `src/`, `lib/`, `index.js`, `package.json` or this folder (`.github/workflows/instruction-count.yml`). It counts the CPU instructions Express runs per request, for the branch and for its merge-base, and flags any scenario that needs more than 1% more. For now it only reports (`--report-only`, in the job summary) and doesn't fail the pull request; deleting the `--report-only` line in the workflow turns it into a gate.

Times from [`benchmarks/compare`](../compare/README.md) depend on what else the machine is doing, so they can't gate a pull request on a shared CI runner. Instruction counts barely do: the same code counts within about 0.1% from run to run.

The method, the Node flags and the CI setup come from `bench/count.js` and the `compare-with-main` job of the [objection.js fork](https://github.com/abedmurrar/objection.js).

## Scenarios

The same eight as `benchmarks/compare` (`scenarios.ts` builds the same Express apps as `servers.ts`): `hello`, `json`, `params`, `mw10`, `routes100`, `post-json`, `not-found` and `query` (a flat query string read through `req.query` with the extended parser), plus one of its own: `format`, `res.format({ json, html })` on Chrome's `Accept` header, which measures content negotiation. It isn't in `benchmarks/compare`, whose other frameworks have no `res.format` built in. A scenario's extra request headers are new strings each request, made from their bytes, as Node's parser makes them. The first response of every run is checked (status and body), so a scenario can't silently measure something else.

## How it counts

- **No network.** `worker.ts` builds each request as Node's HTTP server would: a real `http.IncomingMessage` and `http.ServerResponse`, on one keep-alive in-memory socket that throws the bytes away. Express's whole request path runs, including writing the headers and body to the socket. Only Node's HTTP parser is left out, which Express doesn't change. Nothing depends on the kernel or on how bytes arrive.
- **Startup and warm-up don't count.** Each scenario runs `warmup` requests in one process and `warmup + requests` in another, and the difference divided by `requests` is the count per request. `requests` is chosen for about `--target` instructions, and both checkouts send the same number.
- **A long, fixed warm-up.** `--warmup` is 30,000 requests. V8 keeps compiling Express's request path to optimized code until about 20,000 requests (31,000 for `post-json`), and compiling one function costs as much as dozens of requests, so a measured window that still contains compiling counts a moving target. With a warm-up of half the measured requests (as in the objection fork, whose operations are bigger), the same tree spread 0.8% from run to run.
- **Deterministic Node flags.** `--single-threaded` (the counters count every thread, and V8's background compiler and GC threads add a varying amount), `--hash-seed=1 --random-seed=1` (the same hash tables in every process), `--initial-old-space-size=512` (no full garbage collection that lands inside one checkout's measured requests and not the other's) and `--no-allocation-site-pretenuring` (V8 otherwise turns pretenuring on or off depending on which scavenges it happens to run) come from the objection fork. This harness adds `--predictable`: V8 shrinks the young generation when it measures a low allocation rate in bytes per millisecond, and under valgrind Node's startup is slow enough to trigger that, more or less often depending on the machine's load. Without the flag, the same 30,000 requests counted either about 4,680M or 4,720M instructions, depending on the run. With it, five runs fell within 0.3M (0.006%). The flag doesn't fix the young generation's size, which still grows with what survives, as it does without valgrind; the young generation is left to V8 (in the objection fork, fixing its size made small operations count 28-43% more instructions).
- **A window of about a billion instructions.** What's left of the noise is a fixed amount per process, about ±0.3M instructions: glibc's malloc and V8's optimizing compiler do slightly different work from run to run (found by diffing two cachegrind profiles of the same run with `cg_diff`; turning off address-space randomization doesn't remove it). Against a measured window of 300M instructions that was up to 0.65% between two runs of the same tree, so the window is 1e9 (`--target`). Under valgrind that costs only a few seconds per process, because Node's startup and the warm-up take most of the time.
- **The right baseline.** The baseline is a temporary git worktree at `git merge-base HEAD <--against>`, so it differs from the branch by exactly the branch's changes. Its path has the same length as this checkout's, and it uses this checkout's `node_modules` (a symlink), so the dependencies are the same files at the same paths. The head is the working tree, uncommitted changes included. When `package.json` has a `build` script (the sources in `src/`, compiled into `lib/`), both are built with `npm run build` first, as in `benchmarks/compare`; a checkout passed with `--baseline` has to be built already.
- **A scenario over the limit is measured twice more**, and fails only if the median of the three is still over it.

## Running it

perf (Linux, needs `kernel.perf_event_paranoid` at 2 or lower: `sudo sysctl kernel.perf_event_paranoid=2`):

```sh
cd ~/Dev/express
node benchmarks/count/run.ts --max-change 1                    # HEAD vs the merge-base with origin/master
node benchmarks/count/run.ts --against master --scenarios hello,json
node benchmarks/count/run.ts --baseline ../express-other       # any other checkout
```

valgrind, as in CI (no hardware counters needed, about 30 to 60 seconds per process). The workflow installs Debian's `valgrind_3.19.0-1_amd64.deb`, checked against its SHA-256, with `dpkg -x` and `VALGRIND_LIB`; the same works locally without root:

```sh
node benchmarks/count/run.ts --counter valgrind --runs 1 --jobs 4 --max-change 1
```

Options: `--against <ref>` (`origin/master`), `--baseline <dir>` (instead of the merge-base), `--scenarios a,b`, `--counter perf|valgrind`, `--runs` (2; each checkout is counted this many times and the median taken), `--target` instructions per measurement (1e9), `--warmup` requests (30000), `--max-change <percent>`, `--report-only` (list the scenarios over `--max-change` but exit with 0), `--jobs` (scenarios at once; doesn't change the counts), `--keep-base`.

Comparing a checkout with itself (`--baseline .`) shows the run-to-run noise; with `--runs` above 1, every run's count is printed.

The harness is strict TypeScript that Node 24 runs directly. Type-check it with `npm --prefix benchmarks/count install` and `npm --prefix benchmarks/count run typecheck` (CI does both). The gate itself needs nothing beyond Express's own dependencies and a counter.

## Noise and proof

Measured on 2026-11-21 (see the instruction-count row in `ROADMAP.md`):

Six counts per scenario of the same tree (`--baseline . --runs 3`: three for each side, each the count one CI run makes), with valgrind 3.19.0 and the CI settings (1e9-instruction window). perf was blocked on that machine (`perf_event_paranoid` is 4). Instructions per request:

| Scenario | Requests counted | Counts | Spread (max - min) |
|---|---|---|---|
| hello | 11,851 | 84.70k, 84.65k, 84.70k, 84.62k, 84.65k, 84.64k | 0.09% |
| json | 10,228 | 97.61k, 97.60k, 97.62k, 97.59k, 97.61k, 97.55k | 0.07% |
| params | 11,423 | 87.37k, 87.38k, 87.41k, 87.39k, 87.35k, 87.38k | 0.07% |
| mw10 | 9,904 | 101.08k, 101.02k, 101.12k, 101.11k, 101.08k, 101.14k | 0.12% |
| routes100 | 7,732 | 128.94k, 128.91k, 128.90k, 128.88k, 128.93k, 128.91k | 0.05% |
| post-json | 7,253 | 136.27k, 136.22k, 136.13k, 136.14k, 136.10k, 136.18k | 0.12% |
| not-found | 10,138 | 98.50k, 98.59k, 98.58k, 98.52k, 98.54k, 98.54k | 0.09% |

Comparing the tree with itself, the medians of the two sides differed by at most 0.06% (post-json). The 1% limit is about 8 times the largest spread.

Before the fixes, with a warm-up of half the measured requests and no `--predictable`, `hello` spread 0.8% (180.46k to 181.93k), and with the 30,000-request warm-up but a 3e8 window, `params` spread 0.65%.

A deliberately slowed build (a 1,000-step loop at the start of `res.send`, not committed) against the merge-base, at the CI settings with `--max-change 1`: the run exits with 1, and every scenario that calls `res.send` is over the limit after the two extra measurements, while `not-found`, which doesn't call it, stays flat:

| Scenario | Merge-base | Slowed build | Change |
|---|---|---|---|
| hello | 84.68k | 96.47k | +13.93% |
| json | 97.57k | 109.87k | +12.60% |
| params | 87.32k | 99.22k | +13.63% |
| mw10 | 101.10k | 113.02k | +11.79% |
| routes100 | 128.89k | 140.97k | +9.38% |
| post-json | 136.17k | 148.34k | +8.94% |
| not-found | 98.66k | 98.61k | -0.05% |

That run took 53 minutes locally with `--jobs 2`, most of it the two extra measurements of each failing scenario.

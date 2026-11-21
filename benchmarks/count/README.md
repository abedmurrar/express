# Instruction count

A speed gate that runs on every pull request that changes `lib/`, `index.js`, `package.json` or this folder (`.github/workflows/instruction-count.yml`). It counts the CPU instructions Express runs per request, for the branch and for its merge-base, and fails when any scenario needs more than 1% more.

Times from [`benchmarks/compare`](../compare/README.md) depend on what else the machine is doing, so they can't gate a pull request on a shared CI runner. Instruction counts barely do: the same code counts within about 0.1% from run to run.

The method, the Node flags and the CI setup come from `bench/count.js` and the `compare-with-main` job of the [objection.js fork](https://github.com/abedmurrar/objection.js).

## Scenarios

The same seven as `benchmarks/compare` (`scenarios.ts` builds the same Express apps as `servers.ts`): `hello`, `json`, `params`, `mw10`, `routes100`, `post-json` and `not-found`. The first response of every run is checked (status and body), so a scenario can't silently measure something else.

## How it counts

- **No network.** `worker.ts` builds each request as Node's HTTP server would: a real `http.IncomingMessage` and `http.ServerResponse`, on one keep-alive in-memory socket that throws the bytes away. Express's whole request path runs, including writing the headers and body to the socket. Only Node's HTTP parser is left out, which Express doesn't change. Nothing depends on the kernel or on how bytes arrive.
- **Startup and warm-up don't count.** Each scenario runs `warmup` requests in one process and `warmup + requests` in another, and the difference divided by `requests` is the count per request. `requests` is chosen for about `--target` instructions, and both checkouts send the same number.
- **A long, fixed warm-up.** `--warmup` is 30,000 requests. V8 keeps compiling Express's request path to optimized code until about 20,000 requests (31,000 for `post-json`), and compiling one function costs as much as dozens of requests, so a measured window that still contains compiling counts a moving target. With a warm-up of half the measured requests (as in the objection fork, whose operations are bigger), the same tree spread 0.8% from run to run.
- **Deterministic Node flags.** `--single-threaded` (the counters count every thread, and V8's background compiler and GC threads add a varying amount), `--hash-seed=1 --random-seed=1` (the same hash tables in every process), `--initial-old-space-size=512` (no full garbage collection that lands inside one checkout's measured requests and not the other's) and `--no-allocation-site-pretenuring` (V8 otherwise turns pretenuring on or off depending on which scavenges it happens to run) come from the objection fork. This harness adds `--predictable`: V8 shrinks the young generation when it measures a low allocation rate in bytes per millisecond, and under valgrind Node's startup is slow enough to trigger that, more or less often depending on the machine's load. Without the flag, the same 30,000 requests counted either about 4,680M or 4,720M instructions, depending on the run. With it, five runs fell within 0.3M (0.006%). The flag doesn't fix the young generation's size, which still grows with what survives, as it does without valgrind; the young generation is left to V8 (in the objection fork, fixing its size made small operations count 28-43% more instructions).
- **A window of about a billion instructions.** What's left of the noise is a fixed amount per process, about ±0.3M instructions: glibc's malloc and V8's optimizing compiler do slightly different work from run to run (found by diffing two cachegrind profiles of the same run with `cg_diff`; turning off address-space randomization doesn't remove it). Against a measured window of 300M instructions that was up to 0.65% between two runs of the same tree, so the window is 1e9 (`--target`). Under valgrind that costs only a few seconds per process, because Node's startup and the warm-up take most of the time.
- **The right baseline.** The baseline is a temporary git worktree at `git merge-base HEAD <--against>`, so it differs from the branch by exactly the branch's changes. Its path has the same length as this checkout's, and it uses this checkout's `node_modules` (a symlink), so the dependencies are the same files at the same paths. The head is the working tree, uncommitted changes included.
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

Options: `--against <ref>` (`origin/master`), `--baseline <dir>` (instead of the merge-base), `--scenarios a,b`, `--counter perf|valgrind`, `--runs` (2; each checkout is counted this many times and the median taken), `--target` instructions per measurement (1e9), `--warmup` requests (30000), `--max-change <percent>`, `--jobs` (scenarios at once; doesn't change the counts), `--keep-base`.

Comparing a checkout with itself (`--baseline .`) shows the run-to-run noise; with `--runs` above 1, every run's count is printed.

The harness is strict TypeScript that Node 24 runs directly. Type-check it with `npm --prefix benchmarks/count install` and `npm --prefix benchmarks/count run typecheck` (CI does both). The gate itself needs nothing beyond Express's own dependencies and a counter.

## Noise and proof

Measured on 2026-11-21 (see the instruction-count row in `ROADMAP.md`):

Six counts per scenario of the same tree (`--baseline . --runs 3`: three for each side), with valgrind 3.19.0 (perf is blocked on that machine: `perf_event_paranoid` is 4), instructions per request:

| Scenario | Window | Counts | Spread (max - min) |
|---|---|---|---|
| hello | 1e9 (11,851 requests) | 84.70k, 84.65k, 84.70k, 84.62k, 84.65k, 84.64k | 0.09% |
| json | 1e9 (10,228 requests) | 97.61k, 97.60k, 97.62k, 97.59k, 97.61k, 97.55k | 0.07% |
| params | 3e8 (3,422 requests) | 87.41k, 87.65k, 87.39k, 87.08k, 87.20k, 87.20k | 0.65% (why the window is now 1e9) |

Before the fixes, with a warm-up of half the measured requests and no `--predictable`, `hello` spread 0.8% (180.46k to 181.93k). The other scenarios at the 1e9 window, and the slowed-build proof, are still to be measured.

---
title: Roadmap
description: A summary of the abedmurrar/express roadmap, from the test safety net to bug fixes, speed-ups, TypeScript and a 6.0 line.
---

# Roadmap

The full plan is [ROADMAP.md](https://github.com/abedmurrar/express/blob/master/ROADMAP.md). It records a decision for every open upstream issue and pull request, and the research behind it is in [`research/`](https://github.com/abedmurrar/express/tree/master/research).

## Two lines

- **`master`, the compatible line:** a drop-in replacement for Express 5.3.0 on Node.js 22, 24 and 26 (see the [compatibility promise](./compatibility)). Upstream `master` gets merged in regularly.
- **`6.x`, the next major:** holds the breaking changes, and `master` gets merged into it.

## Order of work

1. **Foundation:** vendoring `router` and `send`, the differential harness and the benchmark harness. Done.
2. **Tests:** the safety net comes before the riskiest changes: coverage, the ecosystem and security suites, more differential scenarios, and mutation testing.
3. **TypeScript and dependencies:** the code moves to strict TypeScript that Node.js runs directly, and users no longer need `@types/express`. Small dependencies are replaced by what Node.js has built in, or forked.
4. **Bug fixes, then performance, then additions,** on the compatible line. Every bug fix has a regression test, and every speed-up has before and after numbers.
5. **Our 6.0, then HTTP/2.**

Docs ride along with each item.

## Rules every change follows

- Tests for the change, and a regression test that fails before and passes after for any bug.
- No difference from Express 5.3.0 in the differential harness, except the ones listed on purpose.
- Coverage stays at 100%, and the ecosystem suite passes.
- A benchmark run for any change to the code apps run.
- Upstream pull requests taken into the fork keep their authors.

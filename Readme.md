# A fork of Express

[![CI][ci-image]][ci-url]
[![Benchmark][bench-image]][bench-url]

This is a fork of [Express](https://github.com/expressjs/express), the web framework for Node.js, maintained at https://github.com/abedmurrar/express. It is not the official Express project, and it isn't published to npm yet.

The `master` branch is a drop-in replacement for **Express 5.3.0** on **Node.js 22, 24 and 26**. It gives the same responses byte for byte, except for bug fixes. Community middleware written for Express keeps working unchanged. Breaking changes go to a separate `6.x` line.

```js
const express = require('express')
const app = express()

app.get('/', (req, res) => {
  res.send('Hello World')
})

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000')
})
```

## What's different from Express 5.3.0

The full plan, with a decision for every open upstream issue and pull request, is in [ROADMAP.md](ROADMAP.md). The research behind it is in [research/](research/README.md). So far:

* **Proof that nothing changes by accident.** Every change runs through:
  * a differential check that sends the same requests to this fork and to Express 5.3.0 and requires identical responses;
  * the same check with popular middleware (body-parser, cors, helmet, morgan, cookie-parser, express-session, compression, multer, passport, express-rate-limit);
  * a fuzzer that builds random apps and requests and runs that check on each, and property tests that check query parsing, routing, content negotiation, cookies, ranges, ETags and freshness on random inputs;
  * a 100% coverage gate.
* **Regression tests for 21 confirmed bugs**, which stay skipped until each fix lands.
* **A security test suite** that checks auth guards against path tricks (case, slashes, encoding, RegExp paths), header injection, redirect targets, prototype pollution and path traversal. Each check was shown to fail when its guard is broken on purpose.
* **A benchmark on every PR** against Express 5.3.0, Fastify, Koa, Hono, polka and plain `node:http`. It runs in CI, and the results are in [benchmarks/results](benchmarks/results).
* **Our own copies of `router` and `send`** (see [VENDORED.md](VENDORED.md)), so routing and file-sending bugs can be fixed here.
* **Leaner tooling:** Biome for linting and formatting, c8 for coverage, and fewer installed packages.

Coming next: bug fixes, speed-ups and strict TypeScript, all on the drop-in line. See [ROADMAP.md](ROADMAP.md).

## Installation

Node.js 22, 24 or 26 is required. Older versions are not supported.

The fork isn't on npm yet. To try it, install it from GitHub:

```bash
npm install github:abedmurrar/express
```

It installs under the name `express`, so `require('express')` keeps working.

## Documentation

The fork's docs site is https://abedmurrar.github.io/express/. It has the Express 5 documentation from [expressjs.com](https://expressjs.com) (used under CC BY 4.0, with credit), plus a Fork section on what this fork changes, its compatibility promise, benchmarks and roadmap. The source is in [docs/](docs/).

## Development

```bash
git clone https://github.com/abedmurrar/express.git && cd express
npm install
git config core.hooksPath .githooks   # lint staged files and check commit messages

npm test                              # all tests
npm run test-ci                       # all tests, with the 100% coverage gate
npm run lint                          # Biome
REGRESSIONS_ALL=1 npm test            # also run the skipped bug tests (they fail until fixed)
PROPERTY_RUNS=10000 FUZZ_RUNS=10000 npm test   # longer property and fuzz runs (add PROPERTY_SEED / FUZZ_SEED for a new seed)

npm run bench:install && npm run bench   # the benchmark comparison (about 25 minutes)
npm --prefix docs install && npm --prefix docs run docs:dev   # the docs site, on http://localhost:5173/express/
```

Each change is one pull request in this repository, following the "Definition of done" in [ROADMAP.md](ROADMAP.md). Commits use the GitHub noreply address and carry no `Co-Authored-By` lines.

## Security

To report a security problem in this fork, see [SECURITY.md](SECURITY.md).

## Credit

Express was created by [TJ Holowaychuk](https://github.com/tj) and is maintained by the [Express team and its contributors](https://github.com/expressjs/express/graphs/contributors). Everything here builds on their work. Upstream pull requests taken into this fork keep their authors.

The vendored copies of [`router`](https://github.com/pillarjs/router) and [`send`](https://github.com/pillarjs/send) keep their original licences, in `lib/router/LICENSE` and `lib/send/LICENSE`.

## License

[MIT](LICENSE)

[ci-image]: https://img.shields.io/github/actions/workflow/status/abedmurrar/express/ci.yml?branch=master&label=ci
[ci-url]: https://github.com/abedmurrar/express/actions/workflows/ci.yml
[bench-image]: https://img.shields.io/github/actions/workflow/status/abedmurrar/express/benchmark.yml?label=benchmark
[bench-url]: https://github.com/abedmurrar/express/actions/workflows/benchmark.yml

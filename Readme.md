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
* **Built-in TypeScript types and an ES module entry** (see [TypeScript and ES modules](#typescript-and-es-modules)), checked by type tests and [`attw`](https://github.com/arethetypeswrong/arethetypeswrong.github.io).

Coming next: bug fixes, speed-ups and strict TypeScript, all on the drop-in line. See [ROADMAP.md](ROADMAP.md).

## Installation

Node.js 22, 24 or 26 is required. Older versions are not supported.

The fork isn't on npm yet. To try it, install it from GitHub:

```bash
npm install github:abedmurrar/express
```

It installs under the name `express`, so `require('express')` keeps working.

## TypeScript and ES modules

The package ships its own TypeScript types, so you don't need `@types/express`:

```bash
npm uninstall @types/express @types/express-serve-static-core
npm install --save-dev typescript @types/node
```

The types are ported from `@types/express` 5.0.6 and `@types/express-serve-static-core` 5.1.3, so code written for them compiles unchanged: the same names (`Request<P, ResBody, ReqBody, ReqQuery, Locals>`, `Response`, `NextFunction`, `RequestHandler`, `ErrorRequestHandler`, `Router`, `Application`, `Express` and the rest), route parameters inferred from the path, and the global `Express` namespace that middleware such as passport (`req.user`) and multer (`req.file`) add to.

```ts
import express, { type Request, type Response } from 'express'

const app = express()

app.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id }) // req.params.id is a string
})

app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
  res.status(500).json({ error: err.message })
})
```

Imports from `express-serve-static-core` keep working while another `@types` package still installs it, and its types mix with these. To use these types everywhere instead, map the module in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": { "express-serve-static-core": ["./node_modules/express/typings/core.d.ts"] }
  }
}
```

The names apps import from there (`ParamsDictionary`, `Query`, `RouteParameters`, `PathParams` and the like) can also come from `express` itself.

For ES modules, `import express, { Router, json, static as serveStatic } from 'express'` loads `index.mjs`, a thin wrapper over the CommonJS build: `import` and `require` give the same objects, so there is only one copy of Express. `require('express')` and its export shape are unchanged from Express 5.3.0.

## Documentation

The fork's docs site is https://abedmurrar.github.io/express/. It has the Express 5 documentation from [expressjs.com](https://expressjs.com) (used under CC BY 4.0, with credit), plus a Fork section on what this fork changes, its compatibility promise, benchmarks and roadmap. The source is in [docs/](docs/).

## Development

```bash
git clone https://github.com/abedmurrar/express.git && cd express
npm install
npm run build                         # compile src/ into lib/ (npm test and test-ci build first)
git config core.hooksPath .githooks   # lint staged files and check commit messages

npm test                              # all tests
npm run test-ci                       # all tests, with the 100% coverage gate
npm run lint                          # Biome
npm run test:types                    # type tests (strict, loose, @types/express snippets) and the type-size budget
npm run test:types:ts5:install && npm run test:types:ts5   # the same type tests on TypeScript 5.2 and 5.9
npm run attw                          # check the packed types and exports with Are the Types Wrong
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

The vendored copies of [`router`](https://github.com/pillarjs/router), [`send`](https://github.com/pillarjs/send), [`serve-static`](https://github.com/expressjs/serve-static), [`qs`](https://github.com/ljharb/qs), [`body-parser`](https://github.com/expressjs/body-parser), [`negotiator`](https://github.com/jshttp/negotiator) and [`accepts`](https://github.com/jshttp/accepts) keep their original licences, in `src/<package>/LICENSE` (copied into `lib/` when built).

The TypeScript types in `typings/` are ported from [`@types/express`](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/express) (by Boris Yankov, Puneet Arora, Dylan Frankland and Sebastian Beltran) and [`@types/express-serve-static-core`](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/express-serve-static-core) (by Boris Yankov, Satana Charuwichitratana, Jose Luis Leon, David Stephens and Shin Ando), with the other DefinitelyTyped contributors. They are MIT licensed; each file keeps the licence header and lists what changed.

## License

[MIT](LICENSE)

[ci-image]: https://img.shields.io/github/actions/workflow/status/abedmurrar/express/ci.yml?branch=master&label=ci
[ci-url]: https://github.com/abedmurrar/express/actions/workflows/ci.yml
[bench-image]: https://img.shields.io/github/actions/workflow/status/abedmurrar/express/benchmark.yml?label=benchmark
[bench-url]: https://github.com/abedmurrar/express/actions/workflows/benchmark.yml

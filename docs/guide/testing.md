---
title: Testing without a port
description: Test an Express app by handing it requests in memory with light-my-request, without opening a port.
---

# Testing without a port

An Express app is a function that takes a request and a response. [light-my-request](https://www.npmjs.com/package/light-my-request) builds both in memory and calls the app with them, so a test needs no port, no server to start and close, and no network. Express doesn't depend on it; install it for your tests:

```bash
npm install --save-dev light-my-request
```

Export the app without calling `app.listen()`, so a test can load it:

<<< ../../examples/testing-without-a-port/index.js

Then pass the app and a request to `inject()`. The tests below use the [Node.js test runner](https://nodejs.org/api/test.html):

<<< ../../examples/testing-without-a-port/test.js

```bash
node --test examples/testing-without-a-port/test.js
```

Both files are in [examples/testing-without-a-port](https://github.com/abedmurrar/express/tree/master/examples/testing-without-a-port), where `../..` is this repository. In your app it is `express`.

## Don't serve the app in the same process

When it is given an Express app, light-my-request changes the prototypes of `express.request` and `express.response` for the whole process. From the first `inject()` on, an Express app that answers on a real port in that process fails, with errors such as `Cannot set properties of undefined (setting 'headers')`. That holds for every app made with the same copy of Express, and for tests that use a port, such as ones written with [supertest](https://www.npmjs.com/package/supertest).

Keep the two kinds of test in separate processes. `node --test` runs each file in its own process. A runner that loads every file into one process needs two runs.

## What it doesn't cover

There is no connection and no HTTP parser, so use a real server to test:

- what Node.js itself rejects or limits, such as malformed requests, large headers and timeouts
- keep-alive, TLS, HTTP upgrades and [graceful shutdown](/advanced/healthcheck-graceful-shutdown)
- code that needs `req` to be an `http.IncomingMessage`, or `req.socket` to be a real socket: both are stand-ins

A route that never answers leaves `inject()` waiting, so give the tests a time limit, such as `test(name, { timeout: 1000 }, fn)` in the Node.js test runner.

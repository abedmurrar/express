---
layout: home
title: An unofficial fork of Express
titleTemplate: false

hero:
  name: Express fork
  text: An unofficial fork of Express 5
  tagline: A drop-in replacement for Express 5.3.0 on Node.js 22, 24 and 26. This is not the official Express project; the official site is expressjs.com.
  actions:
    - theme: brand
      text: What the fork changes
      link: /fork/
    - theme: alt
      text: Get started
      link: /starter/installing
    - theme: alt
      text: Official Express site
      link: https://expressjs.com

features:
  - title: Drop-in for Express 5.3.0
    details: Same responses byte for byte, except bug fixes, checked against Express 5.3.0 on every change by thousands of differential scenarios.
    link: /fork/compatibility
    linkText: The compatibility promise
  - title: Middleware keeps working
    details: Ten popular middleware packages run on both and must behave identically, and four of them run their own test suites against the fork.
    link: /fork/differences
    linkText: Differences from Express 5.3.0
  - title: Measured on every change
    details: A benchmark against Express 5.3.0, Fastify, Koa, Hono, polka and plain node:http runs on every pull request that changes code.
    link: /fork/benchmarks
    linkText: Benchmarks
---

## About this site

This is the documentation website of [abedmurrar/express](https://github.com/abedmurrar/express), a fork of [Express](https://expressjs.com), the web framework for Node.js. It is maintained separately from Express and is not endorsed by the Express project. For the official project and its documentation, go to [expressjs.com](https://expressjs.com).

The Getting started, Guide, API and Advanced sections are the English Express 5.x documentation from [expressjs.com](https://github.com/expressjs/expressjs.com), written by the Express contributors and used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), with small changes listed on the [licence page](/LICENSE). The [Fork](/fork/) section is ours.

Express was created by [TJ Holowaychuk](https://github.com/tj) and is maintained by the [Express team and its contributors](https://github.com/expressjs/express/graphs/contributors). Everything here builds on their work.

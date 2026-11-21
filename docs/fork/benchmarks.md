---
title: Benchmarks
description: Requests per second for abedmurrar/express compared with Express 5.3.0, Fastify, Koa, Hono, polka and plain node:http.
---

# Benchmarks

Every pull request that changes code runs the benchmark comparison in [`benchmarks/compare`](https://github.com/abedmurrar/express/tree/master/benchmarks/compare). It measures the fork at the branch head and at its base against Express 5.3.0 from npm, Fastify, Koa, Hono, polka and plain `node:http`. Before measuring, it checks that every server returns the same response, so every number compares the same work.

The tables below are copied from [`benchmarks/results`](https://github.com/abedmurrar/express/tree/master/benchmarks/results), which has every run in full. So far the fork hasn't tried to be faster. These runs check that its changes haven't made it slower: every scenario is within about 3% of Express 5.3.0, which is the noise between runs. Speed-ups are on the [roadmap](./roadmap).

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

## The fork compared with Express 5.3.0

Requests per second for each change, and the difference from Express 5.3.0 measured in the same run.

2026-11-21 · Node v24.17.0 · Intel Core i5-1135G7 · median of 3 rounds of 5 s, 50 connections.

| Scenario | Vendored `router` and `send` | Coverage gate | Biome |
|---|---|---|---|
| hello | 35,602 (+3.0%) | 34,850 (+2.0%) | 35,685 (+2.4%) |
| json | 30,926 (-1.0%) | 30,866 (+0.2%) | 31,160 (-0.4%) |
| params | 34,306 (+0.2%) | 33,682 (-0.8%) | 34,098 (-1.3%) |
| mw10 | 32,166 (+0.4%) | 32,107 (+0.8%) | 32,450 (+1.0%) |
| routes100 | 25,480 (+0.3%) | 25,304 (-1.2%) | 24,795 (-1.9%) |
| post-json | 22,862 (+2.9%) | 22,741 (-0.1%) | 22,635 (+0.7%) |
| not-found | 41,808 (-1.1%) | 42,256 (+0.4%) | 42,134 (+1.2%) |

## Other frameworks

From the latest run (the Biome change), requests per second:

| Scenario | Express 5.3.0 | This fork | Koa | polka | Hono | Fastify | `node:http` |
|---|---|---|---|---|---|---|---|
| hello | 34,834 | 35,685 | 40,182 | 55,197 | 57,482 | 57,546 | 64,381 |
| json | 31,288 | 31,160 | 36,944 | 50,621 | 53,910 | 54,819 | 59,088 |
| params | 34,546 | 34,098 | 39,792 | 50,806 | 54,986 | 57,802 | 64,077 |
| mw10 | 32,128 | 32,450 | 37,590 | 48,150 | 45,219 | 57,085 | 63,059 |
| routes100 | 25,288 | 24,795 | 27,115 | 47,990 | 51,165 | 57,046 | 45,008 |
| post-json | 22,488 | 22,635 | 24,222 | 31,370 | 36,178 | 38,019 | 44,195 |
| not-found | 41,622 | 42,134 | 41,667 | 62,864 | 52,726 | 54,960 | 61,853 |

Framework versions: Express 5.3.0, Fastify 5.12.8, Koa 3.3.0, Hono 4.13.19, polka 0.5.2. Load generator: autocannon 9.0.0.

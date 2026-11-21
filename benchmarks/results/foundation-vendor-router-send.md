# Benchmark: foundation/vendor-router-send cbd1e78f

2026-11-21 · Node v24.17.0 · 11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz · load average 0.42 at start

Median of 3 rounds of 5 s (after a 2 s warm-up), 50 connections, requests per second. Base: master 6cca1c48.

## Head compared with the original Express and the base

| Scenario | Head req/s | vs Express 5.3.0 | vs base |
|---|---|---|---|
| hello | 35,602 | +3.0% | +1.7% |
| json | 30,926 | -1.0% | -1.0% |
| params | 34,306 | +0.2% | +1.0% |
| mw10 | 32,166 | +0.4% | -0.6% |
| routes100 | 25,480 | +0.3% | +0.5% |
| post-json | 22,862 | +2.9% | +1.1% |
| not-found | 41,808 | -1.1% | -1.0% |

## Every target

| Scenario | Target | req/s | p50 ms | p99 ms | vs Express 5.3.0 | Runs |
|---|---|---|---|---|---|---|
| hello | express 5.3.0 (npm) | 34,555 | 1 | 2 | +0.0% | 38262, 34555, 31626 |
| hello | base master (6cca1c48) | 35,006 | 1 | 2 | +1.3% | 38365, 35006, 33445 |
| hello | head foundation/vendor-router-send (cbd1e78f) | 35,602 | 1 | 2 | +3.0% | 39005, 35602, 33829 |
| hello | fastify | 59,306 | 0 | 1 | +71.6% | 68509, 59306, 56374 |
| hello | koa | 39,818 | 1 | 2 | +15.2% | 39818, 40522, 38826 |
| hello | hono | 58,928 | 0 | 1 | +70.5% | 58928, 59344, 54902 |
| hello | polka | 54,582 | 0 | 1 | +58.0% | 54582, 55101, 53686 |
| hello | node:http | 64,218 | 0 | 1 | +85.8% | 64218, 65123, 61206 |
| json | express 5.3.0 (npm) | 31,253 | 1 | 2 | +0.0% | 31622, 31253, 30040 |
| json | base master (6cca1c48) | 31,227 | 1 | 2 | -0.1% | 31227, 31416, 29208 |
| json | head foundation/vendor-router-send (cbd1e78f) | 30,926 | 1 | 2 | -1.0% | 31269, 30926, 29816 |
| json | fastify | 54,320 | 0 | 1 | +73.8% | 54691, 54320, 52970 |
| json | koa | 36,632 | 1 | 2 | +17.2% | 36632, 36726, 35166 |
| json | hono | 53,680 | 0 | 1 | +71.8% | 53782, 53680, 50723 |
| json | polka | 49,053 | 0 | 1 | +57.0% | 49053, 50314, 42262 |
| json | node:http | 58,525 | 0 | 1 | +87.3% | 58525, 58525, 55146 |
| params | express 5.3.0 (npm) | 34,222 | 1 | 2 | +0.0% | 34222, 34546, 31685 |
| params | base master (6cca1c48) | 33,960 | 1 | 2 | -0.8% | 33960, 34078, 32437 |
| params | head foundation/vendor-router-send (cbd1e78f) | 34,306 | 1 | 2 | +0.2% | 34363, 34306, 32853 |
| params | fastify | 58,333 | 0 | 1 | +70.5% | 58352, 58333, 56138 |
| params | koa | 39,331 | 1 | 2 | +14.9% | 39709, 39331, 37866 |
| params | hono | 56,291 | 0 | 1 | +64.5% | 56637, 56291, 52778 |
| params | polka | 50,608 | 0 | 1 | +47.9% | 50608, 52547, 48458 |
| params | node:http | 62,854 | 0 | 1 | +83.7% | 62854, 64368, 60720 |
| mw10 | express 5.3.0 (npm) | 32,053 | 1 | 2 | +0.0% | 32053, 32664, 27333 |
| mw10 | base master (6cca1c48) | 32,360 | 1 | 2 | +1.0% | 32453, 32360, 30010 |
| mw10 | head foundation/vendor-router-send (cbd1e78f) | 32,166 | 1 | 2 | +0.4% | 32166, 32533, 30162 |
| mw10 | fastify | 57,334 | 0 | 1 | +78.9% | 57072, 58083, 57334 |
| mw10 | koa | 37,840 | 1 | 2 | +18.1% | 38141, 37520, 37840 |
| mw10 | hono | 45,027 | 1 | 2 | +40.5% | 45443, 45027, 43920 |
| mw10 | polka | 48,310 | 0 | 2 | +50.7% | 48310, 48618, 44598 |
| mw10 | node:http | 62,973 | 0 | 1 | +96.5% | 65155, 62973, 58288 |
| routes100 | express 5.3.0 (npm) | 25,400 | 1 | 3 | +0.0% | 25400, 25442, 24917 |
| routes100 | base master (6cca1c48) | 25,358 | 1 | 3 | -0.2% | 25358, 24984, 25432 |
| routes100 | head foundation/vendor-router-send (cbd1e78f) | 25,480 | 1 | 3 | +0.3% | 25480, 25358, 25570 |
| routes100 | fastify | 58,032 | 0 | 1 | +128.5% | 58032, 57213, 58422 |
| routes100 | koa | 27,870 | 1 | 3 | +9.7% | 27870, 27691, 27960 |
| routes100 | hono | 51,645 | 0 | 1 | +103.3% | 51645, 52144, 50134 |
| routes100 | polka | 47,862 | 1 | 1 | +88.4% | 47862, 48765, 47747 |
| routes100 | node:http | 45,162 | 1 | 2 | +77.8% | 45533, 43613, 45162 |
| post-json | express 5.3.0 (npm) | 22,219 | 2 | 4 | +0.0% | 22485, 21630, 22219 |
| post-json | base master (6cca1c48) | 22,616 | 2 | 4 | +1.8% | 22616, 23061, 22478 |
| post-json | head foundation/vendor-router-send (cbd1e78f) | 22,862 | 2 | 4 | +2.9% | 22862, 21694, 23010 |
| post-json | fastify | 38,314 | 1 | 2 | +72.4% | 38314, 37104, 38755 |
| post-json | koa | 24,146 | 1 | 3 | +8.7% | 24146, 21749, 24600 |
| post-json | hono | 36,280 | 1 | 2 | +63.3% | 36341, 31888, 36280 |
| post-json | polka | 31,685 | 1 | 2 | +42.6% | 31755, 29400, 31685 |
| post-json | node:http | 44,118 | 1 | 2 | +98.6% | 44458, 41750, 44118 |
| not-found | express 5.3.0 (npm) | 42,269 | 1 | 2 | +0.0% | 42422, 40419, 42269 |
| not-found | base master (6cca1c48) | 42,237 | 1 | 2 | -0.1% | 42915, 38211, 42237 |
| not-found | head foundation/vendor-router-send (cbd1e78f) | 41,808 | 1 | 2 | -1.1% | 41808, 38742, 42493 |
| not-found | fastify | 55,094 | 0 | 1 | +30.3% | 55875, 52950, 55094 |
| not-found | koa | 41,635 | 1 | 2 | -1.5% | 42448, 36050, 41635 |
| not-found | hono | 51,414 | 0 | 1 | +21.6% | 51907, 47062, 51414 |
| not-found | polka | 62,154 | 0 | 1 | +47.0% | 62154, 61309, 62797 |
| not-found | node:http | 60,080 | 0 | 1 | +42.1% | 60080, 56067, 61859 |

Framework versions: express-original 5.3.0, fastify 5.12.8, koa 3.3.0, @koa/router 15.7.1, @koa/bodyparser 6.1.0, hono 4.13.19, @hono/node-server 2.1.11, polka 0.5.2, autocannon 9.0.0.

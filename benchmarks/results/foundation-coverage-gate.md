# Benchmark: foundation/coverage-gate a5d7c7d2

2026-11-21 · Node v24.17.0 · 11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz · load average 0.33 at start

Median of 3 rounds of 5 s (after a 2 s warm-up), 50 connections, requests per second. Base: master bed5ef2b.

## Head compared with the original Express and the base

| Scenario | Head req/s | vs Express 5.3.0 | vs base |
|---|---|---|---|
| hello | 34,850 | +2.0% | -0.2% |
| json | 30,866 | +0.2% | +0.9% |
| params | 33,682 | -0.8% | -1.0% |
| mw10 | 32,107 | +0.8% | +1.5% |
| routes100 | 25,304 | -1.2% | -1.5% |
| post-json | 22,741 | -0.1% | +0.2% |
| not-found | 42,256 | +0.4% | -0.1% |

## Every target

| Scenario | Target | req/s | p50 ms | p99 ms | vs Express 5.3.0 | Runs |
|---|---|---|---|---|---|---|
| hello | express 5.3.0 (npm) | 34,152 | 1 | 2 | +0.0% | 36426, 32976, 34152 |
| hello | base master (bed5ef2b) | 34,917 | 1 | 2 | +2.2% | 36547, 33870, 34917 |
| hello | head foundation/coverage-gate (a5d7c7d2) | 34,850 | 1 | 2 | +2.0% | 38518, 32946, 34850 |
| hello | fastify | 57,802 | 0 | 1 | +69.2% | 59050, 55094, 57802 |
| hello | koa | 37,981 | 1 | 2 | +11.2% | 37904, 37981, 40010 |
| hello | hono | 58,250 | 0 | 1 | +70.6% | 58614, 53904, 58250 |
| hello | polka | 54,320 | 0 | 1 | +59.1% | 54320, 49827, 54678 |
| hello | node:http | 63,510 | 0 | 1 | +86.0% | 63936, 61910, 63510 |
| json | express 5.3.0 (npm) | 30,818 | 1 | 3 | +0.0% | 31354, 25128, 30818 |
| json | base master (bed5ef2b) | 30,587 | 1 | 2 | -0.7% | 31112, 29141, 30587 |
| json | head foundation/coverage-gate (a5d7c7d2) | 30,866 | 1 | 3 | +0.2% | 30866, 28622, 31648 |
| json | fastify | 54,077 | 0 | 1 | +75.5% | 54173, 47971, 54077 |
| json | koa | 36,995 | 1 | 2 | +20.0% | 36995, 30918, 37059 |
| json | hono | 53,155 | 0 | 1 | +72.5% | 53155, 46813, 53456 |
| json | polka | 49,309 | 0 | 1 | +60.0% | 49309, 41002, 50032 |
| json | node:http | 59,773 | 0 | 1 | +94.0% | 60131, 49270, 59773 |
| params | express 5.3.0 (npm) | 33,963 | 1 | 2 | +0.0% | 34693, 31928, 33963 |
| params | base master (bed5ef2b) | 34,027 | 1 | 2 | +0.2% | 34734, 27627, 34027 |
| params | head foundation/coverage-gate (a5d7c7d2) | 33,682 | 1 | 2 | -0.8% | 34117, 27986, 33682 |
| params | fastify | 58,058 | 0 | 1 | +70.9% | 58154, 52227, 58058 |
| params | koa | 39,395 | 1 | 2 | +16.0% | 40150, 32432, 39395 |
| params | hono | 55,478 | 0 | 1 | +63.3% | 55478, 49590, 55581 |
| params | polka | 50,730 | 0 | 1 | +49.4% | 50730, 45610, 50954 |
| params | node:http | 62,410 | 0 | 1 | +83.8% | 62410, 58691, 63786 |
| mw10 | express 5.3.0 (npm) | 31,837 | 1 | 2 | +0.0% | 32085, 26875, 31837 |
| mw10 | base master (bed5ef2b) | 31,637 | 1 | 2 | -0.6% | 31637, 30366, 32328 |
| mw10 | head foundation/coverage-gate (a5d7c7d2) | 32,107 | 1 | 2 | +0.8% | 32528, 27790, 32107 |
| mw10 | fastify | 56,848 | 0 | 1 | +78.6% | 56848, 54838, 57738 |
| mw10 | koa | 38,205 | 1 | 2 | +20.0% | 38467, 35870, 38205 |
| mw10 | hono | 45,680 | 1 | 2 | +43.5% | 45680, 42890, 45853 |
| mw10 | polka | 47,670 | 0 | 2 | +49.7% | 48470, 45430, 47670 |
| mw10 | node:http | 63,667 | 0 | 1 | +100.0% | 63667, 55690, 63789 |
| routes100 | express 5.3.0 (npm) | 25,611 | 1 | 3 | +0.0% | 25611, 22933, 25675 |
| routes100 | base master (bed5ef2b) | 25,691 | 1 | 3 | +0.3% | 25691, 22008, 25906 |
| routes100 | head foundation/coverage-gate (a5d7c7d2) | 25,304 | 1 | 3 | -1.2% | 25464, 22632, 25304 |
| routes100 | fastify | 58,109 | 0 | 1 | +126.9% | 58531, 51158, 58109 |
| routes100 | koa | 27,544 | 1 | 3 | +7.5% | 27544, 24152, 28043 |
| routes100 | hono | 51,517 | 0 | 1 | +101.2% | 52886, 45424, 51517 |
| routes100 | polka | 45,923 | 1 | 2 | +79.3% | 45923, 42416, 48042 |
| routes100 | node:http | 44,899 | 1 | 2 | +75.3% | 44899, 39114, 45533 |
| post-json | express 5.3.0 (npm) | 22,763 | 2 | 4 | +0.0% | 22795, 22309, 22763 |
| post-json | base master (bed5ef2b) | 22,690 | 2 | 4 | -0.3% | 22690, 19957, 22808 |
| post-json | head foundation/coverage-gate (a5d7c7d2) | 22,741 | 2 | 4 | -0.1% | 22878, 20331, 22741 |
| post-json | fastify | 36,413 | 1 | 2 | +60.0% | 36413, 34456, 39062 |
| post-json | koa | 22,770 | 2 | 4 | +0.0% | 22770, 21250, 23982 |
| post-json | hono | 34,056 | 1 | 3 | +49.6% | 34056, 32549, 36286 |
| post-json | polka | 29,464 | 1 | 3 | +29.4% | 29464, 27854, 31477 |
| post-json | node:http | 42,230 | 1 | 2 | +85.5% | 40362, 42230, 44438 |
| not-found | express 5.3.0 (npm) | 42,083 | 1 | 2 | +0.0% | 39954, 42422, 42083 |
| not-found | base master (bed5ef2b) | 42,307 | 1 | 2 | +0.5% | 39096, 42307, 42845 |
| not-found | head foundation/coverage-gate (a5d7c7d2) | 42,256 | 1 | 2 | +0.4% | 37578, 42467, 42256 |
| not-found | fastify | 56,086 | 0 | 1 | +33.3% | 49981, 56086, 56784 |
| not-found | koa | 41,354 | 1 | 2 | -1.7% | 37634, 41558, 41354 |
| not-found | hono | 51,062 | 0 | 1 | +21.3% | 48579, 51702, 51062 |
| not-found | polka | 63,197 | 0 | 1 | +50.2% | 60387, 63862, 63197 |
| not-found | node:http | 60,810 | 0 | 1 | +44.5% | 56931, 61693, 60810 |

Framework versions: express-original 5.3.0, fastify 5.12.8, koa 3.3.0, @koa/router 15.7.1, @koa/bodyparser 6.1.0, hono 4.13.19, @hono/node-server 2.1.11, polka 0.5.2, autocannon 9.0.0.

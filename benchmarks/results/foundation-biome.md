# Benchmark: foundation/biome 937bd052

2026-11-21 · Node v24.17.0 · 11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz · load average 0.39 at start

Median of 3 rounds of 5 s (after a 2 s warm-up), 50 connections, requests per second. Base: master 7b7a3f65.

## Head compared with the original Express and the base

| Scenario | Head req/s | vs Express 5.3.0 | vs base |
|---|---|---|---|
| hello | 35,685 | +2.4% | +2.9% |
| json | 31,160 | -0.4% | -0.5% |
| params | 34,098 | -1.3% | +1.8% |
| mw10 | 32,450 | +1.0% | -0.0% |
| routes100 | 24,795 | -1.9% | -1.8% |
| post-json | 22,635 | +0.7% | +0.0% |
| not-found | 42,134 | +1.2% | +1.5% |

## Every target

| Scenario | Target | req/s | p50 ms | p99 ms | vs Express 5.3.0 | Runs |
|---|---|---|---|---|---|---|
| hello | express 5.3.0 (npm) | 34,834 | 1 | 2 | +0.0% | 36227, 34834, 34600 |
| hello | base master (7b7a3f65) | 34,680 | 1 | 2 | -0.4% | 36266, 34680, 34568 |
| hello | head foundation/biome (937bd052) | 35,685 | 1 | 2 | +2.4% | 36566, 35685, 35378 |
| hello | fastify | 57,546 | 0 | 1 | +65.2% | 51638, 57546, 59958 |
| hello | koa | 40,182 | 1 | 2 | +15.4% | 35384, 40976, 40182 |
| hello | hono | 57,482 | 0 | 1 | +65.0% | 51018, 57482, 58749 |
| hello | polka | 55,197 | 0 | 1 | +58.5% | 52611, 55197, 55510 |
| hello | node:http | 64,381 | 0 | 1 | +84.8% | 63923, 64573, 64381 |
| json | express 5.3.0 (npm) | 31,288 | 1 | 2 | +0.0% | 30981, 31445, 31288 |
| json | base master (7b7a3f65) | 31,307 | 1 | 2 | +0.1% | 31307, 31547, 30898 |
| json | head foundation/biome (937bd052) | 31,160 | 1 | 2 | -0.4% | 30722, 31160, 31422 |
| json | fastify | 54,819 | 0 | 1 | +75.2% | 54819, 54122, 54954 |
| json | koa | 36,944 | 1 | 2 | +18.1% | 36944, 36650, 36970 |
| json | hono | 53,910 | 0 | 1 | +72.3% | 54243, 53910, 52950 |
| json | polka | 50,621 | 0 | 1 | +61.8% | 50230, 50621, 50845 |
| json | node:http | 59,088 | 0 | 1 | +88.9% | 59088, 59658, 58518 |
| params | express 5.3.0 (npm) | 34,546 | 1 | 2 | +0.0% | 34546, 34210, 34763 |
| params | base master (7b7a3f65) | 33,506 | 1 | 2 | -3.0% | 32070, 34027, 33506 |
| params | head foundation/biome (937bd052) | 34,098 | 1 | 2 | -1.3% | 34338, 33640, 34098 |
| params | fastify | 57,802 | 0 | 1 | +67.3% | 57802, 58883, 57770 |
| params | koa | 39,792 | 1 | 2 | +15.2% | 39792, 39709, 39990 |
| params | hono | 54,986 | 0 | 1 | +59.2% | 54986, 54486, 56426 |
| params | polka | 50,806 | 0 | 1 | +47.1% | 50806, 51133, 50499 |
| params | node:http | 64,077 | 0 | 1 | +85.5% | 63322, 64742, 64077 |
| mw10 | express 5.3.0 (npm) | 32,128 | 1 | 2 | +0.0% | 32128, 32346, 30363 |
| mw10 | base master (7b7a3f65) | 32,453 | 1 | 2 | +1.0% | 32910, 32453, 30709 |
| mw10 | head foundation/biome (937bd052) | 32,450 | 1 | 2 | +1.0% | 32450, 32635, 31389 |
| mw10 | fastify | 57,085 | 0 | 1 | +77.7% | 57680, 57085, 52938 |
| mw10 | koa | 37,590 | 1 | 2 | +17.0% | 38390, 37590, 24994 |
| mw10 | hono | 45,219 | 1 | 2 | +40.7% | 45955, 45219, 35875 |
| mw10 | polka | 48,150 | 0 | 2 | +49.9% | 49085, 48150, 39152 |
| mw10 | node:http | 63,059 | 0 | 1 | +96.3% | 63059, 64413, 60330 |
| routes100 | express 5.3.0 (npm) | 25,288 | 1 | 3 | +0.0% | 25288, 25406, 24146 |
| routes100 | base master (7b7a3f65) | 25,259 | 1 | 3 | -0.1% | 25502, 25259, 24517 |
| routes100 | head foundation/biome (937bd052) | 24,795 | 1 | 3 | -1.9% | 24795, 25189, 24142 |
| routes100 | fastify | 57,046 | 0 | 1 | +125.6% | 57046, 58077, 55088 |
| routes100 | koa | 27,115 | 1 | 3 | +7.2% | 27454, 27115, 25221 |
| routes100 | hono | 51,165 | 0 | 1 | +102.3% | 51165, 52496, 48413 |
| routes100 | polka | 47,990 | 1 | 1 | +89.8% | 47990, 48682, 45994 |
| routes100 | node:http | 45,008 | 1 | 2 | +78.0% | 45014, 45008, 42486 |
| post-json | express 5.3.0 (npm) | 22,488 | 2 | 4 | +0.0% | 22488, 22552, 20498 |
| post-json | base master (7b7a3f65) | 22,635 | 2 | 4 | +0.7% | 22635, 23051, 21458 |
| post-json | head foundation/biome (937bd052) | 22,635 | 2 | 4 | +0.7% | 22843, 22635, 20741 |
| post-json | fastify | 38,019 | 1 | 2 | +69.1% | 38019, 38819, 35566 |
| post-json | koa | 24,222 | 1 | 3 | +7.7% | 24344, 24222, 21896 |
| post-json | hono | 36,178 | 1 | 2 | +60.9% | 36238, 36178, 33418 |
| post-json | polka | 31,370 | 1 | 3 | +39.5% | 31370, 31706, 29752 |
| post-json | node:http | 44,195 | 1 | 2 | +96.5% | 44195, 44374, 39320 |
| not-found | express 5.3.0 (npm) | 41,622 | 1 | 2 | +0.0% | 42672, 41622, 40554 |
| not-found | base master (7b7a3f65) | 41,501 | 1 | 2 | -0.3% | 41501, 43037, 39402 |
| not-found | head foundation/biome (937bd052) | 42,134 | 1 | 2 | +1.2% | 42211, 42134, 39112 |
| not-found | fastify | 54,960 | 0 | 1 | +32.0% | 56016, 54960, 54595 |
| not-found | koa | 41,667 | 1 | 2 | +0.1% | 41782, 41667, 40522 |
| not-found | hono | 52,726 | 0 | 1 | +26.7% | 52726, 53027, 49834 |
| not-found | polka | 62,864 | 0 | 1 | +51.0% | 62864, 63642, 60541 |
| not-found | node:http | 61,853 | 0 | 1 | +48.6% | 61853, 62038, 58333 |

Framework versions: express-original 5.3.0, fastify 5.12.8, koa 3.3.0, @koa/router 15.7.1, @koa/bodyparser 6.1.0, hono 4.13.19, @hono/node-server 2.1.11, polka 0.5.2, autocannon 9.0.0.

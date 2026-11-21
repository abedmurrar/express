# What Fastify does better than Express, and what Express 6 could take

As of 2026-11-21. Compared versions: Express 5.3.0 (`~/Dev/express`, commit `43fca52d`) with router 2.2.0, path-to-regexp 8.4.2, body-parser 2.4.0, finalhandler 2.1.1. Fastify 5.12.8 with find-my-way 9.10.2, fast-json-stringify 7.3.8, avvio 9.3.1, light-my-request 6.8.1, pino 10.4.0, secure-json-parse 4.1.1, @fastify/ajv-compiler 4.0.8 (ajv 8.20.0).

How to read the references:

- `lib/...` means `~/Dev/express/lib/...`.
- `router/...`, `body-parser/...`, `finalhandler/...` and `path-to-regexp/...` mean `~/Dev/express/node_modules/<name>/...`.
- `fastify/...`, `find-my-way/...`, `fast-json-stringify/...` and the other Fastify dependencies mean `~/Dev/express/research/bench/node_modules/<name>/...`.

Every code claim below was checked in those files. Behaviour marked "checked by running" came from two short in-process scripts (no server listening, run with `nice`, while your benchmark was running). They are described in the section "What I ran".

Express 6 context: open PRs #7549 to #7554 (env defaults to production, body-parser and serve-static re-exports removed, Node 24+, `res.send` stops JSON-serializing objects, X-Powered-By removed) and the perf PR #7555 (skip the prototype swap for `app.listen()`).

---

## Summary table

"Where it goes" uses three labels: **core 5.x** (can land without breaking anyone), **6.x breaking** (changes a default or a contract, so it needs the major), and **plugin** (better as an opt-in package; core should at most add a small hook for it).

| Area | What Fastify does | What Express 5.3 does | Visible difference | Where it goes | Behaviour risk |
|---|---|---|---|---|---|
| Routing | Radix tree per HTTP method (find-my-way). Lookup cost depends on the URL's length, not on how many routes exist. Host and version constraints are built in | Walks every layer in order and runs one path-to-regexp regex per layer until one matches | A request to the 100th route runs 100 regexes in Express and one tree walk in Fastify. A 404 runs all of them | Core, inside the router package, as a pre-filter that keeps the order. A real tree is 6.x or later | High: Express's "first registered wins, mixed with middleware" order and RegExp paths don't fit a tree |
| Request/response objects | Builds `new Request()` / `new Reply()` wrappers per request, with a fixed shape known at startup | `Object.setPrototypeOf` on the raw `req` and `res` for every request | About 2.4 µs per request on Node 24 (perf-wg#15). Express getters re-run their work on every access | Core 5.x (PR #7555, plus caching the getters, PRs #7517 and #7519) | Low for #7555. Low to medium for caching (stale values after a `req.url` rewrite) |
| Serialization | Response schema compiled to a serializer function at startup. Fields not in the schema are dropped. No ETag | `JSON.stringify` on every call, then a SHA-1 weak ETag over the whole body by default | Faster JSON for schema routes. No hashing cost in Fastify. Express sends ETag and 304 by default | ETag default: 6.x breaking. Schema serializer: plugin | Medium (ETag affects caching clients). Low for the plugin |
| Validation | ajv schemas for body, query, params and headers, compiled at startup | None in core | 400 with a structured error before the handler runs | Plugin | Low. Fastify's own advisories show this layer is easy to get wrong |
| Hooks lifecycle | 10 named request hooks, worked out per route at startup. A route with no hooks pays nothing | One ordered middleware chain plus `res.on('finish')` | You can change the payload just before it is sent (onSend), and hooks run on timeout and on client abort | Plugin. Possibly a small core hook for before-send | High if put in core |
| Encapsulation | Plugins get a child instance: decorators, hooks, parsers, error and 404 handlers are scoped. Errors are thrown for duplicate decorators | Sub-apps and Routers scope middleware by path. Settings and prototypes are inherited on mount | Fastify catches plugin mistakes at startup. Express mistakes show up at runtime | Not portable as a whole | High |
| Async and errors | Sends the resolved return value of a handler. Error handlers are scoped. JSON error and 404 bodies. Warns on a second send | Rejected promises go to `next(err)`. Resolved values are ignored. HTML error pages with the stack outside production | Less boilerplate, clearer misuse messages | Better double-send message: core 5.x. Auto-send of return values: plugin or 6.x opt-in | Medium (handlers that already `return res.json()`) |
| Body parsers | Built-in JSON and text parsers with proto-poisoning checks and a 1 MiB limit, cached parser lookup per content type. Empty JSON body is a 400 | body-parser middleware, `JSON.parse` with no key filtering, 100 KB default limit. Empty JSON body becomes `{}` | `{"__proto__":...}` gets a 400 in Fastify and is accepted in Express (checked by running) | body-parser option now, default `error` in 6.x | Low to medium: rejects payloads that carry those keys on purpose |
| Logging and request ids | pino child logger per request with a request id, request and response log lines, all off by default | `debug` only. Errors go to `console.error` | Structured logs and correlation ids out of the box | Plugin (pino-http already exists). Possibly `req.id` | Low |
| Testing | `fastify.inject()` uses light-my-request, no socket | supertest opens a real ephemeral server | No port in tests | Docs only: light-my-request already works with Express 5.3 (checked by running) | None |
| Graceful close | `close()` runs hooks, answers 503 to new requests during drain, closes idle or all keep-alive sockets | `app.listen()` returns a plain `http.Server`. No close helper | Fewer dropped requests on deploy | Plugin or a small opt-in helper | Low |
| TypeScript | Types ship in the package. Type providers derive request and reply types from the route schema | `@types/express` from DefinitelyTyped. `ReqBody` and `ResBody` default to `any`. Path params are typed from the route string | Typed bodies with no extra declarations | Types in the repo (PR #6382). Type providers need schemas, so plugin | Low |
| Security defaults | Proto-poisoning error, numeric `trustProxy` disabled after an advisory, last X-Forwarded-Host entry used, 414 for params over 100 chars, error on duplicate routes | No JSON key filtering, numeric `trust proxy` trusts the direct peer, first X-Forwarded-Host/Proto entry used, no param length limit, duplicate routes allowed | See section 11 | Mix: deprecate in 5.x, change in 6.x | Medium: `trust proxy: 1` is very common |
| Published benchmarks | fastify/benchmarks, autocannon with 10-deep pipelining | (Express only benchmarks against itself, perf-wg#8) | Claimed: 78,696 vs 53,785 req/s (GET), 47,248 vs 27,924 (POST) | n/a | n/a |

Where Express does more than Fastify by default, and should keep it: automatic `OPTIONS` replies with an `Allow` header (`router/index.js:177-180`, `698-714`; Fastify returns 404, see `fastify/lib/handle-request.js:85`), ETag and 304 handling (`lib/response.js:162-196`; Fastify needs `@fastify/etag`), views and `res.render`, and a smaller default body limit (100 KB vs 1 MiB).

---

## Details per area

### 1. Routing

**Fastify.** Each HTTP method has its own radix tree (`find-my-way/index.js:186-197` when routes are added). `find()` (`find-my-way/index.js:627-720`) cleans the URL once, splits off the query string, then goes down the tree one node at a time. Static children are found by comparing character codes (`find-my-way/lib/node.js:100-110`), and parametric and wildcard children are tried in a fixed priority order with a backtracking stack (`lib/node.js:208-222`). The query string is parsed once with `fast-querystring` (`find-my-way/index.js:29`, `91-95`) and handed to the route as `request.query`. An optional "compile" mode turns each tree into generated JavaScript (`find-my-way/index.js:825-833`). Fastify turns it on only with `routerOptions.compile: true`, and the default is `false` (`fastify/fastify.js:404-406`, `fastify/lib/config-validator.js:1294`).

Constraints are part of the router: `host` and `version` (`Accept-Version` header) come built in, and custom strategies can be added. The function that reads them from the request is generated once and skipped completely when no route uses constraints (`find-my-way/lib/constrainer.js:149-176`). Fastify also rejects path params longer than `maxParamLength` (100) with a 414 (`find-my-way/index.js:101`, `fastify/fastify.js:704-722`), and throws `FST_ERR_DUPLICATED_ROUTE` when the same method and URL are registered twice (`fastify/lib/route.js:365-378`; checked by running).

**Express.** `Router.prototype.handle` (`router/index.js:149-345`) calls `next()`, which walks `this.stack` from where it stopped. For each layer it calls `matchLayer` → `layer.match(path)` (`router/index.js:235-272`, `517-523`). `Layer.match` runs each of the layer's path-to-regexp matchers (`router/lib/layer.js:178-209`), and each matcher is a compiled `RegExp.exec` (`path-to-regexp/dist/index.js:223-234`). Only `app.use()` layers mounted at `/` skip the regex (`router/lib/layer.js:47`, `183-187`). A route layer that matches the path but not the method is skipped after the regex has already run (`router/index.js:260-271`). Inside a route, `Route.dispatch` walks the route's own stack again (`router/lib/route.js:98-160`). There is no host or version routing in core (the `vhost` package is separate), and duplicate routes are accepted silently.

**Work per request with N routes.** Take N routes like `app.get('/r<i>/:id')`. A request to route k runs k regexes, plus a `try/catch` wrapper and an `Object.keys` on the matched params (`router/lib/layer.js:206`). An unknown URL runs all N. Fastify's cost depends on the number of path segments and characters. Your benchmark's `routes100` scenario (`research/bench/server.js`) measures exactly this. It was still running, so I don't quote its numbers here.

**Can Express adopt it?** Not directly. Express routing is ordered: middleware and routes interleave, the first registered match wins, `next('route')` and `next('router')` exist, paths can be `RegExp` objects or arrays (`router/lib/layer.js:49-93`), and `app.use` strips prefixes from `req.url`. A radix tree has no order. Options that keep the current behaviour:

- **Core, in the router package (no API change):** a cheap check before the regex. Each layer stores its literal leading prefix (for example `/r12/`), and `matchLayer` skips the regex when the path can't start with that prefix (with the same case-insensitive rule the layer already uses). Order stays exactly the same. The gain only shows with many routes.
- **6.x or a separate router:** an opt-in tree-based router for apps that only use string paths. It would ship as its own package that apps choose to use.

**Risk.** The pre-filter must reproduce path-to-regexp's case-insensitivity, the `strict` trailing-slash rule (`loosen`, `router/lib/layer.js:239-247`) and decoding exactly, or routes silently stop matching. Anything tree-based changes which handler wins when two routes overlap.

### 2. Request and response object creation

**Fastify.** Per route, Fastify keeps a `Request` and a `Reply` constructor (`fastify/lib/route.js:531-532`). The constructors give every object the same fixed set of fields (`fastify/lib/request.js:33-41`, `fastify/lib/reply.js:66-78`). Decorations with plain values are copied in by the generated constructor (`fastify/lib/request.js:74-97`, `fastify/lib/reply.js:1023-1051`), and decorations that are functions go on the prototype (`fastify/lib/decorate.js:49-68`). Plugins that add no decorations reuse the parent constructor (`fastify/lib/route.js:402-408`). The raw Node objects are never changed. `request.query` and `request.params` are plain data fields set once. Getters such as `host`, `hostname` and `protocol` just read headers (`fastify/lib/request.js:234-277`). The trust-proxy versions are only installed when `trustProxy` is set (`fastify/lib/request.js:105-153`). Response headers go into a plain object (`fastify/lib/reply.js:273-297`) and are written once with `res.writeHead(status, headers)` (`fastify/lib/reply.js:587-597`).

**Express.** `app.handle` sets `X-Powered-By`, links `req.res` and `res.req`, then calls `Object.setPrototypeOf(req, this.request)` and `Object.setPrototypeOf(res, this.response)` for every request (`lib/application.js:152-178`). Mounted sub-apps swap again on the way in and back on the way out (`lib/application.js:230-237`). The getters are defined with `defineGetter` (`lib/request.js:521`), and none of them cache:

- `req.query` re-parses the query string on every access (`lib/request.js:230-241`). Open PR #7517 caches it.
- `req.protocol`, `req.ip`, `req.host` and `req.hostname` look up `trust proxy fn` and run it on every access (`lib/request.js:297-315`, `340-343`, `418-431`, `444-458`). Open PR #7519 caches them.
- `res.set` calls `setHeader` right away for every header (`lib/response.js:671-685`).

**Measured difference.** perf-wg#15 (comment of 2026-10-24, saved in `research/raw/threads/perf-wg-15.json`): in an in-process bench of `res.send('Hello World!')`, the prototype swap costs 11.1 µs → 8.6 µs on Node 24.16 (-22%) and 11.0 µs → 8.5 µs on Node 26.9 (-23%). On Node 22.13 it was much larger: 64.8 µs → 11.6 µs (-82%).

**Can Express adopt it?**

- PR #7555 (core 5.x): `app.listen()` creates the server with `IncomingMessage` and `ServerResponse` classes whose prototypes are already `app.request` and `app.response`, and `app.handle` skips the swap when the prototype is already right. Apps that call `http.createServer(app)` themselves keep the swap. Risk: low. Watch for code that checks `Object.getPrototypeOf(req)` or replaces `app.request` after `listen()`.
- Caching getters (core 5.x): risk is stale values when middleware rewrites `req.url` (for example, URL-rewrite middleware) or changes headers after the first read. Keying the cache on `req.url` (the same approach parseurl uses for `req._parsedUrl`) keeps the results identical.
- Fastify-style wrappers instead of the real `req`/`res`: not possible without breaking the whole middleware ecosystem, which expects `req` to be the Node `IncomingMessage`. Buffering headers in an object and writing them once is not safe either: middleware such as `on-headers`, compression and helmet read and write headers through Node's own API.

### 3. Serialization and ETag

**Fastify.** If a route has `schema.response`, the serializer is compiled once at startup (`fastify/lib/route.js:440-447`, `fastify/lib/validation.js:18-50`). fast-json-stringify generates the function with `new Function` (`fast-json-stringify/index.js:449`, `646`). On send, Fastify picks the serializer for the status code and content type, falling back to `2xx`-style keys (`fastify/lib/schemas.js:148-190`). Without a schema it uses `JSON.stringify` (`fastify/lib/reply.js:1086-1092`). An object schema without `additionalProperties` drops undeclared fields (`fast-json-stringify/index.js:741-764`). Checked by running: a handler returning `{ id: 1, password: 'secret' }` with a schema of only `id` sent `{"id":1}`. Fastify core has no ETag code at all (a search of `fastify/lib` for "etag" finds nothing).

**Express.** `res.json` calls `JSON.stringify` with the app's replacer, spaces and escape settings (`lib/response.js:236-249`, `1026-1050`), then `res.send`. By default `etag` is `weak` (`lib/application.js:95`). `res.send` then turns the body into a Buffer and hashes it with SHA-1 through the `etag` package (`lib/response.js:162-193`, `lib/utils.js:249-257`, `etag/index.js:47`), and checks `req.fresh` to answer 304 (`lib/response.js:196`). When ETag is off and the body is under 1000 characters, it only computes the byte length (`lib/response.js:170-172`).

**Difference.** Express pays for a Buffer copy and a SHA-1 hash on every `res.send`/`res.json` response. The fastify/benchmarks Express server turns both ETag and X-Powered-By off (`app.disable('etag')`, `app.disable('x-powered-by')` in `benchmarks/express.cjs`). In return, Express clients get conditional GET and 304 for free.

**Can Express adopt it?**

- ETag off by default: **6.x breaking**. It changes cache behaviour for every client that sends `If-None-Match`. A gentler option: keep weak ETags but skip hashing for status codes that can't be cached, or when `Cache-Control: no-store` is set (open PR #6994).
- Schema serializer: **plugin**. A small core hook such as `app.set('json serializer', fn)` (called where `stringify` is called) or a per-route `res.json` override would let a plugin plug in fast-json-stringify. A community package already exists (express-fast-json-stringify, perf-wg#68, closed). Risk: low as opt-in. As a default it would silently drop fields, which is a behaviour change.
- PR #7553 (6.x: `res.send` no longer JSON-serializes objects) moves all JSON through `res.json`, which makes that the single place to hook a serializer.

### 4. Validation

**Fastify.** `compileSchemasForValidation` compiles ajv validators for `headers`, `body` (per content type if asked), `querystring` and `params` at startup (`fastify/lib/validation.js:273-340`, called from `fastify/lib/route.js:414-438`). The default ajv options are `coerceTypes: 'array'`, `useDefaults: true`, `removeAdditional: true`, `allErrors: false` (`@fastify/ajv-compiler/lib/default-ajv-options.js:6-13`), so input is also changed: types are coerced, defaults filled in, extra fields removed. Validation runs after preValidation and before preHandler (`fastify/lib/handle-request.js:106-147`). Errors become a 400 unless `attachValidation` is set.

**Express.** Nothing in core. Users add express-validator, celebrate, zod middleware, express-openapi-validator, and so on.

**Difference.** Fastify rejects bad input before any handler code runs, and the same schema feeds TypeScript and the serializer.

**Can Express adopt it?** **Plugin.** Core has no schema concept, and adding one would be a new framework. Note the risk from Fastify's own history: the advisory list for fastify/fastify has several validation bypasses in 2026 (for example GHSA-247c-9743-5963 "Body Schema Validation Bypass via Leading Space in Content-Type Header", GHSA-hwr6-493r-vm6h "skipped boolean false schemas", GHSA-9q9j-q6p8-xq58 "incomplete schema case normalization"). A validation layer is security-critical code that needs its own maintainers.

### 5. Hooks lifecycle

**Fastify.** The request hooks are `onTimeout, onRequest, preParsing, preValidation, preSerialization, preHandler, onSend, onResponse, onError, onRequestAbort` (`fastify/lib/hooks.js:11-22`). The application hooks are `onRoute, onRegister, onReady, onListen, preClose, onClose`. At `preReady`, each route stores its final hook arrays, or `null` when empty (`fastify/lib/route.js:394-400`), so a request only pays for hooks that exist (`fastify/lib/route.js:595-604`, `fastify/lib/handle-request.js:91-100`, `137-146`). Hooks can use callbacks or promises (`fastify/lib/hooks.js:230-266`), and each hook checks `reply.sent` so it stops once a reply is out (`fastify/lib/hooks.js:410-413`). `onSend` can replace the payload (`fastify/lib/hooks.js:278-322`). `onTimeout` is attached to the socket's timeout (`fastify/lib/route.js:588-593`), and `onRequestAbort` runs when the client goes away (`fastify/lib/route.js:606-615`). Hook signatures are checked when the route is registered: an async function with a callback argument throws `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` (`fastify/lib/route.js:305-331`). Fastify 5.12 also has `handlerTimeout`, which aborts `request.signal` and sends an error after N ms (`fastify/lib/route.js:537-582`), and a lazy `request.signal` that aborts when the client disconnects (`fastify/lib/request.js:220-233`). There is also a `diagnostics_channel` tracing channel around the handler (`fastify/lib/handle-request.js:22`, `154-168`).

**Express.** One ordered chain of `(req, res, next)` and `(err, req, res, next)` functions (`router/lib/layer.js:106-167`). "Before send" needs `on-headers` or monkey-patching `res.end`. "After response" uses `res.on('finish')`. There are no abort or timeout hooks, no `req.signal`, and no diagnostics channels (none found in `lib/` or `router/`). Users have asked for this: #3945 (a hook just before the response is sent), #5249 (global error/response handler). Open PR #6959 adds `diagnostics_channel` events.

**Difference.** Fastify lets you change the payload before sending, run cleanup on abort, and time out handlers without extra packages. The per-route precomputation also means global hooks cost nothing on routes that skip them.

**Can Express adopt it?**

- `req.signal` (an AbortSignal that aborts on client close): **core 5.x**, small, opt-in by being lazy like Fastify's. Risk: low (a new property name could clash with an app's own `req.signal`).
- `diagnostics_channel` (PR #6959): **core 5.x**, no behaviour change when nobody subscribes.
- A full hook system: **plugin** or later. Putting it in core would create a second ordering model next to middleware.

### 6. Encapsulation (plugins, decorators, scoped contexts)

**Fastify.** `register(plugin, opts)` goes through avvio (`fastify/fastify.js:386-389`). Unless a plugin is marked `skip-override` (fastify-plugin; `fastify/lib/plugin-utils.js:62`), `override` creates a child with `Object.create(parent)` and new copies of the Request/Reply constructors, content-type parsers, hooks, route prefix, schema controller, 404 handler and log settings (`fastify/lib/plugin-override.js:28-77`). Decorators throw `FST_ERR_DEC_ALREADY_PRESENT` on a duplicate (`fastify/lib/decorate.js:19-22`, `49-53`), `FST_ERR_DEC_AFTER_START` after startup (`fastify/lib/decorate.js:145-149`), and `FST_ERR_DEC_REFERENCE_TYPE` for objects that would be shared across requests (`fastify/lib/decorate.js:70-74`). Plugins can declare required decorators and dependencies (`fastify/lib/plugin-utils.js:65-107`). Plugin loading has a timeout (`pluginTimeout` 10000 ms, `fastify/lib/config-validator.js:1294`).

**Express.** Routers and sub-apps give path-scoped middleware. A sub-app inherits `trust proxy`, settings, engines and the request/response prototypes from its parent on mount (`lib/application.js:109-122`). Adding things to `app.request` or `req` is free-form and silent. Issue #7427 reports that `router.use()` accepts a sub-app without the prototype restore that `app.use()` does.

**Difference.** Fastify finds wiring errors (missing dependency, duplicate decorator, decorator added too late) at startup. Express finds them at runtime, or never.

**Can Express adopt it?** Not as a whole: the async boot, the child instances and the "ready" phase are the core of Fastify's design. Small useful pieces: a startup check (or `debug` output) for duplicate routes, and fixing #7427. Both fit **core 5.x**.

### 7. Async handlers, errors and 404

**Fastify.**
- If a handler returns a non-undefined value, that value is sent. A promise is awaited and its value sent (`fastify/lib/handle-request.js:187-210`, `fastify/lib/wrap-thenable.js:12-50`).
- A rejection after the reply was already sent is logged, not sent (`fastify/lib/wrap-thenable.js:62-65`).
- A second `reply.send` logs a warning (`FST_ERR_REP_ALREADY_SENT`, "did you forget to `return reply`") and returns; it does **not** throw (`fastify/lib/reply.js:161-164`; checked by running: the first body was sent and a warn line was logged). If `writeHead` itself fails with `ERR_HTTP_HEADERS_SENT`, Fastify logs the same hint and re-throws (`fastify/lib/reply.js:587-597`).
- `setErrorHandler` is scoped per plugin and chains to the parent (`fastify/lib/error-handler.js:141-149`, `fastify/fastify.js:801-815`).
- The default handler uses `error.statusCode`/`status` and `error.headers` (`fastify/lib/error-handler.js:95-100`, `151-166`). The fallback serializes a JSON body `{error, code, message, statusCode}` (`fastify/lib/error-handler.js:102-139`).
- The 404 body is JSON `{"message":"Route GET:/nope not found","error":"Not Found","statusCode":404}` (`fastify/lib/four-oh-four.js:52-58`; checked by running), and `setNotFoundHandler` can be set per prefix (`fastify/lib/four-oh-four.js:75-157`).

**Express.**
- `Layer.handleRequest` catches thrown errors and promise rejections and calls `next(err)`, but ignores resolved values (`router/lib/layer.js:142-167`).
- Error middleware is chosen by `fn.length === 4` (`router/lib/layer.js:106-131`).
- The final handler (`finalhandler/index.js:69-125`) sends HTML. It includes `err.stack` unless env is `production` (`finalhandler/index.js:157-162`), and Express's env defaults to `development` (`lib/application.js:91`; PR #7549 changes this in 6.x). It logs with `console.error` (`lib/application.js:615-618`). If headers were already sent, it destroys the socket (`finalhandler/index.js:118-122`).
- A second `res.send` throws `ERR_HTTP_HEADERS_SENT` from `setHeader` (checked by running). In a sync handler that becomes `next(err)` and then a destroyed socket. Inside callbacks it can crash the process (issue #7560, for `res.render`).

**Can Express adopt it?**

- A clearer double-send error: **core 5.x**. `res.send` can check `this.headersSent` first and throw (or warn) with the method and path, keeping the same error code. Risk: low, as long as it still throws.
- Auto-sending resolved values: **6.x opt-in or plugin**. Many Express handlers write `return res.json(x)`, which resolves to `res`, and some return values by accident. A rule like "send if not `undefined`, not `res`, and nothing sent yet" would change behaviour for those apps. Risk: medium.
- JSON default error and 404 bodies: **6.x breaking** (content type changes). PR #7549 already removes the stack-leak part by defaulting env to production.

### 8. Content-type parsers vs body-parser

**Fastify.** Parsers are registered per content type, string or RegExp, and scoped per plugin. JSON and text/plain come built in (`fastify/lib/content-type-parser.js:33-38`). Lookup is cached in a 100-entry FIFO keyed by the raw header (`fastify/lib/content-type-parser.js:119-152`). Body reading checks `content-length` against the limit before reading, and counts both encoded and decoded bytes (`fastify/lib/content-type-parser.js:251-310`). The default limit is 1 MiB (`bodyLimit` 1048576, `fastify/lib/config-validator.js:1294`) and can be set per route. JSON goes through `secure-json-parse` with `protoAction`/`constructorAction` set to `error` (`fastify/lib/content-type-parser.js:339-352`). That library only runs its full filter when a regex finds `"__proto__"` or `"constructor"` keys, including `\u`-escaped forms (`secure-json-parse/index.js:4-5`, `44-66`). A missing parser gives 415 (`fastify/lib/content-type-parser.js:192-203`). An empty JSON body is a 400 (`FST_ERR_CTP_EMPTY_JSON_BODY`).

**Express.** body-parser middleware, re-exported as `express.json` and the others (`lib/express.js`; PR #7550 removes the re-exports in 6.x). The default limit is 100 KB (`body-parser/lib/utils.js:46-48`). JSON is `JSON.parse(body, reviver)` with no key filtering (`body-parser/lib/types/json.js:70-115`), and an empty body becomes `{}` (`body-parser/lib/types/json.js:77-81`). Type matching uses `type-is` per request (`body-parser/lib/utils.js:27`).

**Checked by running:** posting `{"__proto__":{"x":1}}` to `express.json()` + `res.json(req.body)` returned 200 and echoed it back. Fastify returned 400.

**Why it matters.** `JSON.parse` doesn't pollute prototypes by itself (it creates an own key named `__proto__`). The danger comes later, when that object is passed to a deep merge or `Object.assign`-style code. Fastify stops it at the door.

**Can Express adopt it?** An `onProto: 'error' | 'remove' | 'ignore'` option in **body-parser** (a minor release), then `error` as the default in body-parser's next major or in 6.x docs. Risk: low to medium: APIs that accept arbitrary JSON keys (key-value stores, JSON Patch documents about `constructor`) would start getting 400s. The cost is one regex pass over the body, and the full filter only runs when the regex hits.

### 9. Logging, request ids, `inject()`, graceful close

**Logging.** Fastify turns logging off by default (`abstract-logging`, `fastify/lib/logger-factory.js:87-91`). With `logger: true`, each request gets a pino child logger bound to its request id (`fastify/lib/route.js:465-486`, `fastify/lib/logger-factory.js:29-41`) and the "incoming request" and "request completed" lines (`fastify/lib/log-controller.js:47-68`). Ids are `req-<base36 counter>` (`fastify/lib/req-id-gen-factory.js:31-44`) or come from a header when `requestIdHeader` is set (`fastify/lib/req-id-gen-factory.js:46-50`). The default is `false`, which means a client can't inject ids. Express has only `debug` and `console.error`. **Plugin** (pino-http, morgan already fill this). A core `req.id` is possible but low value.

**`inject()`.** `fastify.inject()` loads light-my-request on first use and calls the server's handler with fake `req`/`res` objects, no socket (`fastify/fastify.js:499-535`). light-my-request takes any `(req, res)` function (`light-my-request/index.js:12`). **Checked by running:** `inject(expressApp, ...)` works with Express 5.3.0 for GET with a query, POST with `express.json()`, and the 404 path, even though light-my-request's `Request` extends `Readable` rather than `IncomingMessage` and Express swaps its prototype. Express can adopt this with **docs only** (a testing guide section), or a tiny `app.inject` wrapper later. Express's own tests use supertest (`package.json` devDependencies). Risk: none for docs. Not every Node API is faked (no real socket), so tests that touch `req.socket` details may differ.

**Graceful close.** `fastify.close()` sets `closing`, and from then on `routeHandler` answers 503 with a fixed JSON body and `Connection: close` (on by default, `return503OnClosing`, `fastify/lib/route.js:112`, `488-512`). It runs `preClose` and `onClose` hooks and, depending on `forceCloseConnections`, calls `closeIdleConnections()`, `closeAllConnections()`, or destroys the tracked keep-alive sockets (`fastify/fastify.js:409-428`, tracking in `fastify/lib/route.js:514-523`). Express's `app.listen()` just returns `http.createServer(this).listen(...)` (`lib/application.js:598-606`). On this machine's Node (v24.17.0), `http.Server.prototype.closeIdleConnections` and `closeAllConnections` both exist, so an Express helper would be thin. Best as a **plugin** or documented recipe, maybe an opt-in `app.close()` later. Risk: low as opt-in. Making 503-on-close the default would change deploy behaviour.

### 10. TypeScript

**Fastify.** Types ship in the package (`"types": "fastify.d.ts"`, `fastify/types/*.d.ts`). A type provider maps a route's schema to request types (body, query, params, headers) and reply types (`fastify/types/type-provider.d.ts:9-18`, `34-125`). With `@fastify/type-provider-typebox` or `-json-schema-to-ts`, the schema that validates at runtime also types the handler. Without one, the route generic `{ Body, Querystring, Params, Reply }` still works.

**Express.** No types in the package. `@types/express` 5.0.x on DefinitelyTyped: `RequestHandler<P, ResBody = any, ReqBody = any, ReqQuery = ParsedQs, ...>` (`types/express-serve-static-core/index.d.ts:55-90`), and `RouteParameters<Route>` derives `req.params` keys from the path string (line 103). Bodies are `any` unless you pass generics by hand, and nothing ties them to runtime checks.

**Can Express adopt it?** Moving types into the repo (open PR #6382) is **core**, separate from 6.x, and fixes version drift. Type providers depend on schemas, so they belong with a validation **plugin**. Risk: low, but type changes break builds even when runtime is unchanged, so they should land with a major or carry a clear note.

### 11. Security defaults

| Item | Fastify | Express 5.3 | Notes |
|---|---|---|---|
| JSON proto poisoning | `error` by default (`fastify/lib/content-type-parser.js:339-352`) | Accepted (`body-parser/lib/types/json.js:93`, `112`) | See section 8 |
| Body limit | 1 MiB default, per route | 100 KB default per parser | Express is stricter. Nothing to port |
| Extended query parser | n/a (`fast-querystring`) | `qs.parse(str, { allowPrototypes: true })` when `query parser` is `extended` (`lib/utils.js:267-271`). Default is `simple` (`lib/application.js:97`) | `allowPrototypes: true` lets keys like `hasOwnProperty` overwrite prototype methods on the parsed object. Worth a 6.x review |
| Numeric trust proxy | Disabled at runtime since 5.12.1: a hop count "cannot validate the immediate peer", so it fails closed (`fastify/lib/request.js:53-57`). Advisory GHSA-3m5p-2c4r-xxw2 (medium, 2026-08-18) | `trust proxy: <n>` compiles to `(addr, i) => i < n` (`lib/utils.js:202-205`). `req.protocol` and `req.host` check `trust(remoteAddress, 0)` (`lib/request.js:303`, `422`), which is always true for n ≥ 1 | Same pattern Fastify fixed: a client that reaches the Node process directly, without the proxy, can set `X-Forwarded-Proto` and `X-Forwarded-Host`. Fine when the app is only reachable through the proxy, but `trust proxy: 1` is the common recipe. See the ranked list |
| Which X-Forwarded-Host/Proto entry | Last entry, the one added by the nearest proxy (`fastify/lib/request.js:99-103`, `127-144`) | First entry (`lib/request.js:309-314`, `424-428`) | If the proxy appends instead of replacing, the first entry is whatever the client sent |
| Restrictive trust check on host/protocol | Added after GHSA-444r-cwp2-x5xf | Already checks `trust(remoteAddress, 0)` | Express was not affected by that one |
| Reply sent twice | Warning log, first reply stands (`fastify/lib/reply.js:161-164`) | `ERR_HTTP_HEADERS_SENT` thrown, socket destroyed by finalhandler | Express is louder. The fix is a better message (section 7) |
| Long path params | 414 past 100 chars | No limit | Low value for Express |
| Duplicate routes | Error at startup | Silently allowed | Startup `debug` warning possible |
| Stack traces in error pages | Never (JSON `message` only) | Yes unless env is `production`, and env defaults to `development` | PR #7549 fixes this in 6.x |
| `X-Powered-By` | Not sent | Sent by default (`lib/application.js:94`, `160-162`) | PR #7554 removes it in 6.x |

### 12. The Fastify benchmarks method and headline numbers (as claimed)

From the README of https://github.com/fastify/benchmarks, run of Sat Nov 14 2026, read with `gh api` on 2026-11-21. These are **their claims**, not my measurements.

- **Machine:** GitHub Actions, linux x64, 4 vCPUs, 15.6 GB. Node v24.22.3. The README itself warns about "noisy neighbor" variance and says the numbers show framework overhead, not real-world performance.
- **Method:** `autocannon -c 100 -d 40 -p 10 localhost:3000`, two rounds (warm-up, then the measured one). `-p 10` means 10 pipelined requests per connection, which rewards low per-request overhead.
- **GET scenario:** `GET /` returns `{ hello: 'world' }`. The Fastify server uses a response schema (`benchmarks/fastify.cjs`). The Express server calls `app.disable('etag')` and `app.disable('x-powered-by')` and uses `res.json` (`benchmarks/express.cjs`).
- **POST scenario:** a `{"hello":"world"}` body is parsed and echoed back.

| Server | GET req/s | GET latency (ms) | POST req/s | POST latency (ms) |
|---|---|---|---|---|
| node-http v24.22.3 | 81,011 | 11.98 | 55,477 | 17.53 |
| fastify 5.12.8 | 78,696 | 12.18 | 47,248 | 20.64 |
| express 5.3.0 | 53,785 | 18.13 | 27,924 | 35.30 |
| express-with-middlewares 5.3.0 (cors + 6 helmet-era middlewares) | 45,006 | 21.71 | n/a | n/a |
| fastify-big-json 5.12.8 | 19,882 | 49.76 | n/a | n/a |

The claimed gap is 1.46x on GET (Fastify reaches 97% of raw node-http) and 1.69x on POST. Express's own perf working group decided not to benchmark against other frameworks (perf-wg#8, quoted in `research/raw/threads/perf-wg-15.json`). Your local A/B in `research/bench/` (5.3.0 vs master vs PR #7555 vs Fastify, scenarios `hello`, `mw10`, `routes100`, `json`, `json-noschema`) was still running when I wrote this, so none of its numbers are used here.

---

## Ranked "worth porting" list

Ranked by user value against effort and risk. "Effort" is a rough size of the change.

| # | Change | Where | Effort | Risk | Why it ranks here |
|---|---|---|---|---|---|
| 1 | Skip the per-request prototype swap when `app.listen()` made the server (PR #7555) | Core 5.x | Small (PR open, +83/-4) | Low: identity checks on `req`'s prototype, or replacing `app.request` after listen | Measured 2.4 µs (-22%) per request on Node 24. Every app benefits. No API change |
| 2 | Cache `req.query` and the trust-proxy getters per request, keyed on `req.url` and the headers they read (PRs #7517, #7519) | Core 5.x | Small | Low to medium: stale values after URL rewrites if not keyed. Prove it with old-vs-new tests | Express re-parses and re-runs the trust function on every access today |
| 3 | Numeric `trust proxy`: warn about it in 5.x and require an address-based form in 6.x, or at least document the direct-access risk. Also review the "first entry" X-Forwarded-Host/Proto choice | 5.x deprecation, then 6.x breaking | Small code, large docs and communication | Medium: `trust proxy: 1` is in many deploy guides, so this needs the security WG and a migration note | Fastify treated the same pattern as a medium advisory and disabled it. Express's getters have the same structure |
| 4 | JSON proto-poisoning option in body-parser (`error`/`remove`/`ignore`), default `error` at body-parser's or Express's next major | body-parser minor, then major | Small (regex prescan + filter, or `secure-json-parse`) | Low to medium: legit `__proto__`/`constructor` keys get a 400 | Closes a common route into deep-merge prototype pollution. Checked by running that Express accepts it today |
| 5 | Clearer double-send error: detect `headersSent` in `res.send`/`res.json`/`res.render` and throw with method and path, same error code | Core 5.x | Small | Low if the error code and throw behaviour stay the same | Express already fails loudly. Better text saves debugging (#7560) |
| 6 | Document `light-my-request` for testing Express apps without a port | Docs | Tiny | None | Checked by running: works with 5.3.0 unchanged |
| 7 | `req.signal` (lazy AbortSignal on client close) and `diagnostics_channel` events (PR #6959) | Core 5.x | Small to medium | Low: no change unless used. Watch the name `req.signal` for clashes | Gives cancellation and APM tracing that Fastify has built in |
| 8 | ETag: skip hashing when it can't help (`no-store`, PR #6994, or status codes that can't be cached). Decide in 6.x whether `etag` stays on by default | Core 5.x for the skip, 6.x for the default | Small | Medium for the default (304s disappear for clients) | SHA-1 over every body is a real per-response cost, and benchmarks turn it off |
| 9 | A serializer hook (`app.set('json serializer', fn)` or per-route) so a plugin can use fast-json-stringify. PR #7553 makes `res.json` the single JSON path | Core 6.x hook + plugin | Small hook, medium plugin | Low as opt-in. Dropping unknown fields must stay opt-in | Big win for large JSON responses, and it can block field leaks |
| 10 | Graceful-close helper (503 while draining, close idle or all sockets) | Plugin or documented recipe | Small | Low as opt-in | Node 24 already has the primitives. Fastify bundles them |
| 11 | Router pre-filter on a literal path prefix before the regex, same order | Router package (core) | Medium | Medium to high: must reproduce case-insensitivity, strict mode and decoding exactly | Helps only apps with many routes. A real radix tree is not compatible with Express ordering |
| 12 | Types in the repo (PR #6382) | Core, ideally aligned with 6.0 | Medium | Low at runtime, but type breakage for users | Removes DefinitelyTyped drift. Schema-driven types stay a plugin concern |
| 13 | Startup `debug` warning for duplicate routes, and fix `router.use(subApp)` (#7427) | Core 5.x | Small | Low (warnings only) | Fastify throws. Express can't throw without breaking intentional duplicates |
| Not recommended for core | Fastify-style Request/Reply wrappers, buffered headers with one `writeHead`, a full hook lifecycle, plugin encapsulation via avvio, built-in ajv validation, built-in pino | n/a | Large | High: breaks the middleware ecosystem, which relies on the real `req`/`res` and Node's header API | These are Fastify's design choices, not missing features. They fit plugins or a separate framework |

### Behaviour already decided by open Express 6 PRs (left as they are)

- #7549 (env defaults to production) already removes stack traces from default error pages. Section 7's JSON error-body idea should be judged after it lands.
- #7553 (`res.send` stops JSON-serializing objects) is a natural place for item 9's serializer hook.
- #7550 (body-parser re-exports removed) means item 4 is body-parser's decision, not Express's.
- #7554 (X-Powered-By removed) matches Fastify already.

---

## What I ran

All in-process (no `listen`), with `nice -n 19` and a 30-second timeout, on Node v24.17.0, while your benchmark was running. The scripts were throwaway and have been deleted.

- `lmr-express.js`: light-my-request against Express 5.3.0 (`research/bench/node_modules/express-530`). Results: GET with query and Host header → 200 with an ETag; POST JSON → echoed; POST `{"__proto__":{"x":1}}` → 200 and echoed; a second `res.send` → threw `ERR_HTTP_HEADERS_SENT`; unknown URL → 404 `text/html`. Also confirmed `http.Server.prototype.closeIdleConnections` and `closeAllConnections` exist.
- `fastify-check.js`: Fastify 5.12.8 with `inject()`. Results: duplicate route → `FST_ERR_DUPLICATED_ROUTE`; `__proto__` body → 400; empty JSON body → 400 `FST_ERR_CTP_EMPTY_JSON_BODY`; response schema dropped an undeclared `password` field and sent no ETag; a second `reply.send` → first body kept, warning logged; unknown URL → 404 JSON.

Not run: no throughput measurement (your benchmark covers it), no TypeScript compile, no test of `@types/express` (not installed locally; read from DefinitelyTyped with `gh api`).

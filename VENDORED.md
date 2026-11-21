# Vendored packages

This fork keeps its own copies of the packages it needs to change. Each one keeps its MIT licence and copyright lines in its folder. Every change we make to a copy is listed below, so we can re-sync from upstream later.

| Package | Upstream | Version | Upstream commit | Our copy | Tests |
|---|---|---|---|---|---|
| `router` | https://github.com/pillarjs/router | 2.3.0 | `d4f4d863` | `lib/router/` | `test/router/` |
| `send` | https://github.com/pillarjs/send | 1.2.1 | `096a6148` | `lib/send/` | `test/send/` (plus `test/send/fixtures/`) |

Why these two: most of the routing bugs and routing performance work are in `router`. The empty-body bug for `/proc` files (#4944) is in `send`.

`router` 2.3.0 is the version a fresh install of upstream Express 5.3.0 already gets, because its range is `^2.2.0`. So vendoring it changes nothing for those users. Compared with 2.2.0 it fixes a rewritten `req.url` losing a slash in a mounted router (upstream issue #4059, pillarjs/router#206). It also adds `router.listRoutes()` (pillarjs/router#174) and the request tracing channels (pillarjs/router#196).

`express.static` still uses the `serve-static` package, which brings its own copy of `send`. Our `lib/send` is used only by `res.sendFile` and `res.download`.

## Changes from upstream

### router

- `lib/router/index.js`: added `const { Buffer } = require('node:buffer')` to match Express's lint rule against the global `Buffer`. No behaviour change.

### router tests

- `require('..')` changed to `require('../../lib/router')`, and `require('../lib/layer')` changed to `require('../../lib/router/lib/layer')`. `require.resolve('..')` changed the same way in `test/router/tracing.js`.
- Added `require('node:buffer')` in `support/utils.js`, `router.js` and `route.js`, for the same lint rule.
- Removed two `eslint-disable-next-line n/handle-callback-err` comments in `tracing.js`, because Express's ESLint config doesn't load that plugin.
- `index.d.ts`, `lib/route.d.ts`, `test/types*` and the TypeScript setup were not copied.

### send

- `lib/send/index.js`: added `var Buffer = require('node:buffer').Buffer`, for the same lint rule. No behaviour change.

### send tests

- `require('..')` changed to `require('../../lib/send')`.

## Dependencies

These were moved from the vendored packages to Express's own `dependencies`: `is-promise` and `path-to-regexp` (router), and `ms` (send). `run-series` was added to `devDependencies` for the router tests.

## Re-syncing

1. Check the upstream releases after the version above.
2. Diff upstream between our commit and the new tag.
3. Apply the changes by hand, keeping the edits listed above.
4. Update this file.
5. Run `npm test` and the differential harness.

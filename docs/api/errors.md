---
title: Error codes
description: The stable code on every error Express creates, and when each one is raised.
---

# Error codes

Every error Express creates has a `code` property, a string that starts with `EXPRESS_ERR_`. Branch on
the code instead of the message: messages are written for people and may change, codes are part of
the API and don't.

::: code-group

```js [index.cjs]
app.use((err, req, res, next) => {
  if (err.code === 'EXPRESS_ERR_VIEW_NOT_FOUND') {
    return res.status(404).render('not-found');
  }
  next(err);
});
```

```ts [index.ts]
import express, { type ErrorCode, type ErrorRequestHandler } from 'express';

const viewNotFound: ErrorCode = 'EXPRESS_ERR_VIEW_NOT_FOUND';

const onError: ErrorRequestHandler = (err, req, res, next) => {
  if (err.code === viewNotFound) {
    return res.status(404).render('not-found');
  }
  next(err);
};
```

:::

The `ErrorCode` type lists every code, so TypeScript catches a mistyped one.

Everything else about these errors is as in Express 5.3.0: the message, the class (a `TypeError`
is still a `TypeError`), and `status`, `statusCode` and `expose` where they have them. The `code`
property is defined like an error's `cause`, and like `code` in the
[TC39 proposal](https://github.com/jasnell/proposal-error-code-property): an own property that you
can assign or delete, but not an enumerable one. So `JSON.stringify(err)`, `Object.keys(err)`,
`{ ...err }` and `console.log(err)` show the same as on Express 5.3.0. One error has a property more:
`EXPRESS_ERR_PARAM_DECODE_FAILED` has `statusCode` as well as `status`, as with router 2.3.0.

::: info

Not in Express 5.3.0. Upstream discussed the idea in
[expressjs/express#6951](https://github.com/expressjs/express/issues/6951), and the codes Express
itself throws use the names from
[expressjs/express#6982](https://github.com/expressjs/express/pull/6982).

:::

## Errors that are not listed

- **Errors that already had a code keep it.** A file `res.sendFile()` can't find has the code `fs`
  gave it (`ENOENT`, `ENOTDIR`, `ENAMETOOLONG`), a request the client aborted during
  `res.sendFile()` has `ECONNABORTED`, a directory passed to `res.sendFile()` has `EISDIR`, and a
  response sent twice has Node's `ERR_HTTP_HEADERS_SENT`.
- **Body parsers** (`express.json()`, `express.raw()`, `express.text()` and
  `express.urlencoded()`) keep their own contract: each of their errors has a `type`, such as
  `'entity.too.large'` or `'entity.parse.failed'`, as listed in the
  [body-parser README](https://github.com/expressjs/body-parser#errors).
- **Errors from other packages** Express calls, such as `path-to-regexp`'s error for a route path
  it can't parse, and errors your own code throws, are passed on as they are.

## Thrown or passed to `next()`

Errors raised by a call your code makes (`app.use()`, `res.status()`, `res.sendFile()` with a bad
path, ...) are thrown by that call. Inside a route handler, the router catches them and passes them
to your error handlers, as for any error a handler throws.

Errors raised while handling a request are passed to `next()`, or to the callback when you give
`res.sendFile()`, `res.download()` or `res.render()` one. `express.static()` passes on only
errors with a status of 500 and up, unless it has `fallthrough: false`; otherwise it calls `next()`
with no error, so the request can reach the routes after it.

## Application and views

| Code | Class | Raised by |
| --- | --- | --- |
| `EXPRESS_ERR_MIDDLEWARE_REQUIRED` | `TypeError` | `app.use()` without a middleware function |
| `EXPRESS_ERR_ENGINE_CALLBACK_REQUIRED` | `Error` | `app.engine()` without a callback |
| `EXPRESS_ERR_INVALID_ETAG_OPTION` | `TypeError` | `app.set('etag', value)` with a value it doesn't know |
| `EXPRESS_ERR_INVALID_QUERY_PARSER_OPTION` | `TypeError` | `app.set('query parser', value)` with a value it doesn't know |
| `EXPRESS_ERR_NO_DEFAULT_ENGINE` | `Error` | `res.render()` or `app.render()` of a name without an extension, with no `view engine` set |
| `EXPRESS_ERR_VIEW_ENGINE_NOT_FOUND` | `Error` | `res.render()` or `app.render()` with an extension whose module has no `__express` export |
| `EXPRESS_ERR_VIEW_NOT_FOUND` | `Error` | `res.render()` or `app.render()` of a view that isn't in any `views` folder; passed to the callback or `next()`, with the `View` as `err.view` |

## Request and response

| Code | Class | Raised by |
| --- | --- | --- |
| `EXPRESS_ERR_HEADER_NAME_REQUIRED` | `TypeError` | `req.get()` without a header name |
| `EXPRESS_ERR_HEADER_NAME_NOT_STRING` | `TypeError` | `req.get()` with a header name that isn't a string |
| `EXPRESS_ERR_INVALID_STATUS_CODE` | `TypeError` | `res.status()` with a value that isn't an integer |
| `EXPRESS_ERR_STATUS_CODE_OUT_OF_RANGE` | `RangeError` | `res.status()` with an integer below 100 or above 999 |
| `EXPRESS_ERR_SENDFILE_PATH_REQUIRED` | `TypeError` | `res.sendFile()` without a path |
| `EXPRESS_ERR_SENDFILE_PATH_NOT_STRING` | `TypeError` | `res.sendFile()` with a path that isn't a string |
| `EXPRESS_ERR_SENDFILE_PATH_NOT_ABSOLUTE` | `TypeError` | `res.sendFile()` with a relative path and no `root` option |
| `EXPRESS_ERR_CONTENT_TYPE_ARRAY` | `TypeError` | `res.set('Content-Type', array)` |
| `EXPRESS_ERR_COOKIE_SECRET_REQUIRED` | `Error` | `res.cookie()` with `signed: true` when no secret was given to `cookie-parser` |
| `EXPRESS_ERR_NOT_ACCEPTABLE` | `NotAcceptableError` (status 406) | `res.format()` when the client accepts none of the types and there is no `default`; passed to `next()`, with the offered types as `err.types` |

## Router

| Code | Class | Raised by |
| --- | --- | --- |
| `EXPRESS_ERR_PARAM_NAME_REQUIRED` | `TypeError` | `router.param()` or `app.param()` without a name |
| `EXPRESS_ERR_PARAM_NAME_NOT_STRING` | `TypeError` | `router.param()` with a name that isn't a string |
| `EXPRESS_ERR_PARAM_CALLBACK_REQUIRED` | `TypeError` | `router.param()` or `app.param()` without a callback |
| `EXPRESS_ERR_PARAM_CALLBACK_NOT_FUNCTION` | `TypeError` | `router.param()` or `app.param()` with a callback that isn't a function |
| `EXPRESS_ERR_ROUTER_CALLBACK_REQUIRED` | `TypeError` | `router.handle()` without its callback |
| `EXPRESS_ERR_HANDLER_REQUIRED` | `TypeError` | `router.use()`, `router.METHOD()`, `route.all()` or `route.METHOD()` (and `app.METHOD()`, `app.all()`), or `router.error()` or `app.error()`, without a handler |
| `EXPRESS_ERR_HANDLER_NOT_FUNCTION` | `TypeError` | the same calls with a handler that isn't a function |
| `EXPRESS_ERR_ROUTER_MOUNTS_ITSELF` | `TypeError` | `router.use()` mounting a router at `/` on itself, directly or through routers mounted at `/` (a fork addition: Express 5.3.0 accepts it and loops on every request) |
| `EXPRESS_ERR_ERROR_HANDLER_IS_ROUTER` | `TypeError` | `router.error()` or `app.error()` given a router or an Express app, which can't take the error (a fork addition, like the `error()` methods) |
| `EXPRESS_ERR_PARAM_DECODE_FAILED` | `URIError` (`status` and `statusCode` 400) | a request whose route parameter isn't valid percent-encoding, such as `/users/%E0` for `/users/:id`; passed to `next()` |
| `EXPRESS_ERR_REJECTED_PROMISE` | `Error` | a handler, error handler or `param` callback whose promise rejects with no reason (`undefined` or another falsy value); passed to `next()` |

## Sending files

From `res.sendFile()`, `res.download()` and `express.static()`.

| Code | Class | Raised by |
| --- | --- | --- |
| `EXPRESS_ERR_INVALID_DOTFILES_OPTION` | `TypeError` | a `dotfiles` option other than `'allow'`, `'deny'` or `'ignore'` |
| `EXPRESS_ERR_INVALID_EXTENSIONS_OPTION` | `TypeError` | an `extensions` option that isn't `false`, a string or an array of strings |
| `EXPRESS_ERR_INVALID_INDEX_OPTION` | `TypeError` | an `index` option that isn't `false`, a string or an array of strings |
| `EXPRESS_ERR_SEND_HEADERS_SENT` | `Error` (status 500) | `res.sendFile()` or `res.download()` after the response headers were sent |
| `EXPRESS_ERR_SEND_INVALID_PATH` | `BadRequestError` (status 400) | a path that isn't valid percent-encoding, or has a null byte |
| `EXPRESS_ERR_SEND_MALICIOUS_PATH` | `ForbiddenError` (status 403) | a path with `..` that leaves its `root`, or any `..` segment when there is no `root` |
| `EXPRESS_ERR_SEND_DOTFILE_DENIED` | `ForbiddenError` (status 403) | a path with a dotfile, with `dotfiles: 'deny'` |
| `EXPRESS_ERR_SEND_DOTFILE_IGNORED` | `NotFoundError` (status 404) | a path with a dotfile, with `dotfiles: 'ignore'` (the default) |
| `EXPRESS_ERR_SEND_IS_DIRECTORY` | `NotFoundError` (status 404) | `express.static()` for a directory, when it ends in `/` and has no index file, or when `redirect` is `false` |
| `EXPRESS_ERR_SEND_NOT_FOUND` | `NotFoundError` (status 404) | a file path ending in `/`, or no file found when every extension or index file tried is a directory |
| `EXPRESS_ERR_SEND_PRECONDITION_FAILED` | `PreconditionFailedError` (status 412) | a request whose `If-Match` or `If-Unmodified-Since` doesn't match the file |
| `EXPRESS_ERR_SEND_RANGE_NOT_SATISFIABLE` | `RangeNotSatisfiableError` (status 416) | a `Range` request with no range inside the file, with the `Content-Range` to send in `err.headers` |
| `EXPRESS_ERR_STATIC_ROOT_REQUIRED` | `TypeError` | `express.static()` without a root |
| `EXPRESS_ERR_STATIC_ROOT_NOT_STRING` | `TypeError` | `express.static()` with a root that isn't a string |
| `EXPRESS_ERR_STATIC_SET_HEADERS_NOT_FUNCTION` | `TypeError` | `express.static()` with a `setHeaders` option that isn't a function |

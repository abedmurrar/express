---
title: Cookies, SameSite and secure cookies behind proxies
description: Set cookies with res.cookie(), choose SameSite and Secure, and make secure cookies work behind a proxy that ends HTTPS.
---

# Cookies, SameSite and secure cookies behind proxies

## What Express sets

[`res.cookie()`](/api/response#rescookie) writes a `Set-Cookie` header with the options you give it, and adds `Path=/`. Nothing else is on by default:

| Call | `Set-Cookie` |
|---|---|
| `res.cookie('a', '1')` | `a=1; Path=/` |
| `res.cookie('a', '1', { httpOnly: true, secure: true, sameSite: 'lax' })` | `a=1; Path=/; HttpOnly; Secure; SameSite=Lax` |
| `res.cookie('a', '1', { sameSite: true })` | `a=1; Path=/; SameSite=Strict` |
| `res.cookie('a', '1', { sameSite: 'none', secure: true, partitioned: true })` | `a=1; Path=/; Secure; Partitioned; SameSite=None` |
| `res.cookie('a', '1', { domain: 'example.com' })` | `a=1; Domain=example.com; Path=/` |

`sameSite` takes `'lax'`, `'strict'`, `'none'`, `true` (the same as `'strict'`) and `false` (no attribute). Any other value throws a `TypeError`.

Express doesn't check the options against each other, the cookie's name or the protocol: it sends `SameSite=None` without `Secure`, or a `__Host-` cookie without `Secure`, and the browser then drops the cookie.

For a cookie that identifies a user, use:

```js
res.cookie('__Host-sid', id, { httpOnly: true, secure: true, sameSite: 'lax' });
```

- `httpOnly` keeps it from JavaScript in the page.
- `secure` keeps it off plain HTTP.
- The `__Host-` prefix makes the browser accept it only with `Secure`, with `Path=/` and without `Domain`, so another subdomain can't set or replace it.

## Choosing SameSite

`SameSite` is about sites, not origins: `app.example.com` and `api.example.com` are the same site, and `example.com` and `example.net` are not.

| Value | The browser sends the cookie with |
|---|---|
| `'strict'` | requests that start from the same site only, so not when a user follows a link from another site |
| `'lax'` | those, and top-level navigation from other sites with a safe method, such as following a link |
| `'none'` | every request, from any site. Browsers require `Secure` |

Without the attribute, what happens depends on the browser: some treat the cookie as `Lax`, some as `None`. Set it.

A front end on another site needs `SameSite=None; Secure`, CORS with credentials, and the browser's own rules on third-party cookies. With [cors](https://www.npmjs.com/package/cors) and the exact origin:

```js
app.use(cors({ origin: 'https://app.example.net', credentials: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, sameSite: 'none' },
}));
```

and `fetch(url, { credentials: 'include' })` in the page. With `'none'`, other sites can make the browser send requests with the cookie, so protect anything that changes data against cross-site request forgery.

## Clearing a cookie

A browser replaces a cookie only with one of the same name, domain and path. Give [`res.clearCookie()`](/api/response#resclearcookie) the options the cookie was set with. It ignores `maxAge` and `expires`, so the same object works for both:

```js
const options = { httpOnly: true, secure: true, sameSite: 'lax' };

res.cookie('__Host-sid', id, options);
res.clearCookie('__Host-sid', options);
// __Host-sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax
```

A browser also drops the header that clears a `__Host-` or `SameSite=None` cookie when it lacks `Secure`.

## Behind a proxy

When a proxy ends HTTPS, the app gets plain HTTP, and `req.protocol` is `'http'`. The proxy says what the client used in the `X-Forwarded-Proto` header, and Express reads it only from a proxy it trusts:

```js
app.set('trust proxy', 'loopback'); // the proxy's addresses or subnets
```

Then `req.secure` is `true` for a request with `X-Forwarded-Proto: https`. See [Express behind proxies](/guide/behind-proxies) for the values `trust proxy` takes. List addresses instead of using `true`, which trusts whoever connects: then any client can send the header.

Make the proxy set the header on every request, replacing whatever the client sent. With several proxies, Express uses the first value in it: `https,http` is `https`, and `http,https` is `http`.

What needs `trust proxy` depends on who sets the cookie:

| Setting the cookie | Over HTTPS, as Express sees it | Over HTTP, as Express sees it |
|---|---|---|
| `res.cookie()` with `secure: true` | sent | sent |
| `express-session` with `cookie: { secure: true }` | sent | **not sent**, without an error |
| `express-session` with `cookie: { secure: 'auto' }` | sent with `Secure` | sent without `Secure` |
| `express-session` with `cookie: { secure: 'auto', sameSite: 'auto' }` | sent with `Secure` and `SameSite=None` | sent with `SameSite=Lax` and no `Secure` |
| `cookie-session` with `secure: true` | sent | **not sent**, without an error |

These are express-session 1.19.0 and cookie-session 2.1.1. So "the login works locally and no session cookie is set in production" is nearly always `trust proxy` missing, not matching the proxy's address, or the proxy not sending `X-Forwarded-Proto`. To find out which, log them in the app:

```js
app.use((req, res, next) => {
  console.log(req.socket.remoteAddress, req.get('X-Forwarded-Proto'), req.secure);
  next();
});
```

- The address is not in `trust proxy`: add it.
- The header is missing: fix the proxy.
- Both are right and `req.secure` is `true`: look at the cookie's own attributes in the browser's developer tools, which say why a cookie was dropped.

Avoid `secure: 'auto'` as a way around it: the session cookie then goes out without `Secure`.

### Example

<<< ../../examples/cookies-behind-proxy/index.js

It is in [examples/cookies-behind-proxy](https://github.com/abedmurrar/express/tree/master/examples/cookies-behind-proxy), where `../..` is this repository. In your app it is `express`. Run it and play the proxy:

```bash
$ curl -si http://localhost:3000/ -H 'X-Forwarded-Proto: https' | grep -i set-cookie
Set-Cookie: __Host-sid=...; Path=/; HttpOnly; Secure; SameSite=Lax

$ curl -si http://localhost:3000/ | grep -i set-cookie
```

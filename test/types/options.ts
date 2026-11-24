// Every option of every options type, given its exact type, and values each
// rejects. `Required<T>` makes tsc ask for all of them.

import type { Buffer } from 'node:buffer'
import type { Stats } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import express from 'express'
import type * as core from '../../typings/core.js'
import { exactly } from './exact.js'

type Any = ReturnType<typeof JSON.parse>
type Verify = (req: IncomingMessage, res: ServerResponse, buf: Buffer, encoding: string) => void

const verify: Verify = (req, res, buf, encoding) => void [req, res, buf, encoding]
const common: Required<express.Options> = {
  inflate: true,
  limit: '1mb',
  type: ['json', 'text'],
  verify
}
const json: Required<express.OptionsJson> = {
  ...common,
  defaultCharset: 'utf-8',
  reviver: (key, value) => [key, value],
  strict: false
}
const text: Required<express.OptionsText> = { ...common, defaultCharset: 'utf-8' }
const urlencoded: Required<express.OptionsUrlencoded> = {
  ...common,
  extended: true,
  parameterLimit: 10,
  defaultCharset: 'iso-8859-1',
  charsetSentinel: true,
  interpretNumericEntities: true,
  depth: 5
}
exactly<express.BodyParserHandler>()(express.raw(common))
exactly<express.BodyParserHandler>()(express.json(json))
exactly<express.BodyParserHandler>()(express.text(text))
exactly<express.BodyParserHandler>()(express.urlencoded(urlencoded))
express.raw({ limit: 1, type: (req) => req.headers['x-raw'], inflate: undefined })
express.raw({ type: 'application/*' })
exactly<void>()(express.json()({} as IncomingMessage, {} as ServerResponse, (err) => void err))
// @ts-expect-error
express.raw({ inflate: 'yes' })
// @ts-expect-error
express.raw({ type: 1 })
// @ts-expect-error
express.raw({ verify: true })
// @ts-expect-error an option of urlencoded()
express.raw({ extended: true })
// @ts-expect-error
express.json({ strict: 'yes' })
// @ts-expect-error
express.json({ reviver: true })
// @ts-expect-error
express.json({ defaultCharset: 8 })
// @ts-expect-error
express.text({ defaultCharset: 8 })
// @ts-expect-error
express.urlencoded({ extended: 'yes' })
// @ts-expect-error
express.urlencoded({ parameterLimit: '10' })
// @ts-expect-error
express.urlencoded({ charsetSentinel: 1 })
// @ts-expect-error
express.urlencoded({ interpretNumericEntities: 1 })
// @ts-expect-error
express.urlencoded({ defaultCharset: 8 })

const router: Required<express.RouterOptions> = {
  caseSensitive: true,
  mergeParams: true,
  strict: true,
  strictMount: true
}
express.Router(router)
// @ts-expect-error
express.Router({ mergeParams: 1 })
// @ts-expect-error
express.Router({ strict: 1 })

const serveStatic: Required<express.ServeStaticOptions<express.Response>> = {
  acceptRanges: true,
  cacheControl: true,
  dotfiles: 'ignore',
  etag: true,
  extensions: ['html'],
  fallthrough: true,
  immutable: true,
  index: ['index.html'],
  lastModified: true,
  maxAge: '1d',
  redirect: true,
  setHeaders: (res, path: string, stat: Stats) => void [res.locals, path, stat]
}
const middleware = express.static('public', serveStatic)
exactly<express.ServeStaticHandler<express.Response>>()(middleware)
exactly<Any>()(middleware({} as IncomingMessage, {} as express.Response, (err) => void err))
const construct: express.ServeStaticConstructor<express.Response> = express.static
void construct
express.static('public', { extensions: false, index: false, maxAge: 1, setHeaders: (res) => res.set('X-A', 'a') })
express.static('public', { index: 'index.htm' })
// @ts-expect-error
express.static(1)
// @ts-expect-error
express.static('public', { acceptRanges: 1 })
// @ts-expect-error
express.static('public', { cacheControl: 1 })
// @ts-expect-error
express.static('public', { dotfiles: 1 })
// @ts-expect-error
express.static('public', { etag: 1 })
// @ts-expect-error
express.static('public', { extensions: 1 })
// @ts-expect-error
express.static('public', { fallthrough: 1 })
// @ts-expect-error
express.static('public', { immutable: 1 })
// @ts-expect-error
express.static('public', { index: 1 })
// @ts-expect-error
express.static('public', { lastModified: 1 })
// @ts-expect-error
express.static('public', { maxAge: true })
// @ts-expect-error
express.static('public', { redirect: 1 })
// @ts-expect-error
express.static('public', { setHeaders: true })

const send: Required<core.SendOptions> = {
  acceptRanges: true,
  cacheControl: true,
  dotfiles: 'deny',
  end: 10,
  etag: true,
  extensions: ['html'],
  immutable: true,
  index: ['index.html'],
  lastModified: true,
  maxAge: '1d',
  root: '/',
  start: 1
}
const sendFile: Required<express.SendFileOptions> = { ...send, headers: { 'x-a': 1 } }
const download: Required<express.DownloadOptions> = { ...send, headers: { 'x-a': 1 } }
express.response.sendFile('a', sendFile)
express.response.download('a', 'b', download)
express.response.sendFile('a', { extensions: 'html', index: 'index.htm', maxAge: 1, dotfiles: 'allow' })
express.response.sendFile('a', { extensions: false, index: false, dotfiles: 'ignore' })
// @ts-expect-error
express.response.sendFile('a', { acceptRanges: 1 })
// @ts-expect-error
express.response.sendFile('a', { cacheControl: 1 })
// @ts-expect-error
express.response.sendFile('a', { end: '1' })
// @ts-expect-error
express.response.sendFile('a', { etag: 1 })
// @ts-expect-error
express.response.sendFile('a', { extensions: 1 })
// @ts-expect-error
express.response.sendFile('a', { immutable: 1 })
// @ts-expect-error
express.response.sendFile('a', { index: 1 })
// @ts-expect-error
express.response.sendFile('a', { lastModified: 1 })
// @ts-expect-error
express.response.sendFile('a', { maxAge: true })
// @ts-expect-error
express.response.sendFile('a', { root: 1 })
// @ts-expect-error
express.response.sendFile('a', { start: '1' })
// @ts-expect-error
express.response.sendFile('a', { headers: 1 })
// @ts-expect-error
express.response.download('a', 'b', { headers: 1 })

const cookie: Required<express.CookieOptions> = {
  maxAge: 1,
  signed: true,
  expires: new Date(),
  httpOnly: true,
  path: '/',
  domain: 'example.com',
  secure: true,
  encode: (value) => value.trim(),
  sameSite: 'lax',
  priority: 'high',
  partitioned: true
}
express.response.cookie('a', 'b', cookie).clearCookie('a', cookie)
express.response.cookie('a', 'b', { sameSite: true, priority: 'low' })
express.response.cookie('a', 'b', { sameSite: 'none', priority: 'medium' })
// @ts-expect-error
express.response.cookie('a', 'b', { maxAge: '1' })
// @ts-expect-error
express.response.cookie('a', 'b', { signed: 1 })
// @ts-expect-error
express.response.cookie('a', 'b', { expires: 'tomorrow' })
// @ts-expect-error
express.response.cookie('a', 'b', { httpOnly: 1 })
// @ts-expect-error
express.response.cookie('a', 'b', { path: 1 })
// @ts-expect-error
express.response.cookie('a', 'b', { domain: 1 })
// @ts-expect-error
express.response.cookie('a', 'b', { encode: true })
// @ts-expect-error
express.response.cookie('a', 'b', { priority: 'highest' })
// @ts-expect-error
express.response.cookie('a', 'b', { partitioned: 1 })

// Every member of Request, with its exact type.

import type { IncomingMessage } from 'node:http'
import express, { type ParamsDictionary, type Request } from 'express'
import type * as core from '../../typings/core.js'
import { exactly, sameMembers } from './exact.js'

type Any = ReturnType<typeof JSON.parse>

express().get('/:id', (req, res, next) => {
  // headers
  exactly<string[] | undefined>()(req.get('set-cookie'))
  exactly<string | undefined>()(req.get('content-type'))
  exactly<string[] | undefined>()(req.header('set-cookie'))
  exactly<string | undefined>()(req.header('content-type'))

  // content negotiation: all of them, or the best of one, a list or several
  exactly<string[]>()(req.accepts())
  exactly<string | false>()(req.accepts('json'))
  exactly<string | false>()(req.accepts(['json', 'html']))
  exactly<string | false>()(req.accepts('json', 'html'))
  exactly<string[]>()(req.acceptsCharsets())
  exactly<string | false>()(req.acceptsCharsets('utf-8'))
  exactly<string | false>()(req.acceptsCharsets(['utf-8', 'utf-16']))
  exactly<string | false>()(req.acceptsCharsets('utf-8', 'utf-16'))
  exactly<string[]>()(req.acceptsEncodings())
  exactly<string | false>()(req.acceptsEncodings('gzip'))
  exactly<string | false>()(req.acceptsEncodings(['gzip', 'br']))
  exactly<string | false>()(req.acceptsEncodings('gzip', 'br'))
  exactly<string[]>()(req.acceptsLanguages())
  exactly<string | false>()(req.acceptsLanguages('en'))
  exactly<string | false>()(req.acceptsLanguages(['en', 'ar']))
  exactly<string | false>()(req.acceptsLanguages('en', 'ar'))
  exactly<string | false | null>()(req.is('json'))
  exactly<string | false | null>()(req.is(['json', 'urlencoded']))

  const ranges = req.range(100, { combine: true })
  if (ranges !== undefined && ranges !== -1 && ranges !== -2) {
    exactly<string>()(ranges.type)
    for (const range of ranges) sameMembers<{ start: number; end: number }>()(range)
    const asRanges: core.RequestRanges = ranges
    void asRanges
  }
  if (ranges === -1 || ranges === -2) exactly<-1 | -2>()(ranges)
  req.range(100)

  // the request and what Express sets on it
  exactly<string>()(req.protocol)
  exactly<boolean>()(req.secure)
  exactly<string | undefined>()(req.ip)
  exactly<string[]>()(req.ips)
  exactly<string[]>()(req.subdomains)
  exactly<string>()(req.path)
  exactly<string>()(req.hostname)
  exactly<string>()(req.host)
  exactly<boolean>()(req.fresh)
  exactly<boolean>()(req.stale)
  exactly<boolean>()(req.xhr)
  exactly<string>()(req.method)
  exactly<string>()(req.url)
  exactly<string>()(req.originalUrl)
  exactly<string>()(req.baseUrl)
  exactly<string | undefined>()(req.originalRoute)
  exactly<AbortSignal>()(req.signal)
  sameMembers<{ id: string }>()(req.params)
  exactly<core.ParsedQs>()(req.query)
  exactly<Any>()(req.body)
  exactly<Any>()(req.cookies)
  exactly<Any>()(req.signedCookies)
  exactly<Any>()(req.route)
  exactly<core.Application>()(req.app)
  exactly<core.Response | undefined>()(req.res)
  exactly<core.NextFunction | undefined>()(req.next)
  const node: IncomingMessage = req
  void node

  // Express 4's, which Express 5 doesn't have
  for (const type of req.accepted) {
    sameMembers<{ value: string; quality: number; type: string; subtype: string }>()(type)
    void [type.value, type.quality, type.type, type.subtype]
  }

  // writable, and not
  req.url = '/rewritten'
  req.baseUrl = '/base'
  req.originalUrl = '/original'
  req.method = 'POST'
  req.body = { parsed: true }
  // @ts-expect-error
  req.protocol = 'https'
  // @ts-expect-error
  req.secure = true
  // @ts-expect-error
  req.ip = '127.0.0.1'
  // @ts-expect-error
  req.ips = []
  // @ts-expect-error
  req.subdomains = []
  // @ts-expect-error
  req.path = '/x'
  // @ts-expect-error
  req.hostname = 'x'
  // @ts-expect-error
  req.host = 'x'
  // @ts-expect-error
  req.fresh = true
  // @ts-expect-error
  req.stale = true
  // @ts-expect-error
  req.xhr = true

  // @ts-expect-error a header name
  req.header()
  // @ts-expect-error
  req.accepts(1)
  // @ts-expect-error
  req.acceptsCharsets(1)
  // @ts-expect-error
  req.acceptsEncodings(1)
  // @ts-expect-error
  req.acceptsLanguages(1)
  // @ts-expect-error
  req.is(1)
  // @ts-expect-error the size
  req.range()
  // @ts-expect-error
  req.range(1, { combine: 'yes' })
  // @ts-expect-error
  req.nope
  next()
  res.end()
})

// The type parameters: params, response body, request body, query, locals.
declare const typed: Request<{ id: string }, { ok: boolean }, { name: string }, { page?: string }, { user: string }>
exactly<{ id: string }>()(typed.params)
exactly<{ name: string }>()(typed.body)
exactly<{ page?: string }>()(typed.query)
exactly<core.Response<{ ok: boolean }, { user: string }> | undefined>()(typed.res)
exactly<ParamsDictionary>()(express.request.params)

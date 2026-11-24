// Every member of Response, with its exact type.

import { Buffer } from 'node:buffer'
import type { ServerResponse } from 'node:http'
import express, { type Send } from 'express'
import type * as core from '../../typings/core.js'
import { exactly } from './exact.js'

express().get('/', (req, res) => {
  type Res = typeof res

  // each returns the response, for chaining
  exactly<Res>()(res.status(201))
  exactly<Res>()(res.links({ next: '/?page=2', pages: ['/?page=1', '/?page=3'] }))
  exactly<Res>()(res.send('body'))
  exactly<Res>()(res.send(Buffer.from('body')))
  exactly<Res>()(res.send())
  exactly<Res>()(res.json({ a: 1 }))
  exactly<Res>()(res.json(null))
  exactly<Res>()(res.jsonp({ a: 1 }))
  exactly<Res>()(res.sendStatus(204))
  exactly<Res>()(res.type('json'))
  exactly<Res>()(res.contentType('text/html'))
  exactly<Res>()(res.format({ json: () => {}, default: () => {} }))
  exactly<Res>()(res.attachment())
  exactly<Res>()(res.attachment('a.pdf'))
  exactly<Res>()(res.append('Link', '<a>'))
  exactly<Res>()(res.append('Link', ['<a>', '<b>']))
  exactly<Res>()(res.set('X-A', 'a'))
  exactly<Res>()(res.set('X-A', ['a', 'b']))
  exactly<Res>()(res.set({ 'X-A': 'a', 'X-B': 1 }))
  exactly<Res>()(res.header('X-A', 'a'))
  exactly<Res>()(res.header('X-A', ['a', 'b']))
  exactly<Res>()(res.header({ 'X-A': 'a' }))
  exactly<Res>()(res.clearCookie('a'))
  exactly<Res>()(res.clearCookie('a', { path: '/admin' }))
  exactly<Res>()(res.cookie('a', 'text'))
  exactly<Res>()(res.cookie('a', 'text', { httpOnly: true }))
  exactly<Res>()(res.cookie('a', { an: 'object' }))
  exactly<Res>()(res.cookie('a', { an: 'object' }, { httpOnly: true }))
  exactly<Res>()(res.location('/x'))
  exactly<Res>()(res.vary('Accept'))

  // these end the response, or will
  exactly<void>()(res.sendFile('/a.txt'))
  exactly<void>()(res.sendFile('/a.txt', (err) => exactly<Error | undefined>()(err)))
  exactly<void>()(res.sendFile('a.txt', { root: '/' }))
  exactly<void>()(res.sendFile('a.txt', { root: '/' }, (err) => exactly<Error | undefined>()(err)))
  exactly<void>()(res.download('/a.txt'))
  exactly<void>()(res.download('/a.txt', (err) => exactly<Error | undefined>()(err)))
  exactly<void>()(res.download('/a.txt', 'b.txt'))
  exactly<void>()(res.download('/a.txt', 'b.txt', (err) => exactly<Error | undefined>()(err)))
  exactly<void>()(res.download('a.txt', 'b.txt', { root: '/' }))
  exactly<void>()(res.download('a.txt', 'b.txt', { root: '/' }, (err) => exactly<Error | undefined>()(err)))
  exactly<void>()(res.redirect('/x'))
  exactly<void>()(res.redirect(301, '/x'))
  exactly<void>()(res.render('view'))
  exactly<void>()(res.render('view', { title: 'a' }))
  exactly<void>()(
    // a function fits the options too, so it isn't typed as the callback
    res.render('view', (err: Error, html: string) => {
      void [err, html]
    })
  )
  exactly<void>()(
    res.render('view', { title: 'a' }, (err, html) => {
      exactly<Error>()(err)
      exactly<string>()(html)
    })
  )

  exactly<string | undefined>()(res.get('Content-Type'))
  exactly<boolean>()(res.headersSent)
  exactly<Record<string, ReturnType<typeof JSON.parse>> & core.Locals>()(res.locals)
  exactly<core.Application>()(res.app)
  exactly<core.Request>()(res.req)
  const node: ServerResponse = res
  // Express 4's, which Express 5 doesn't have
  exactly<string>()(res.charset)
  void [node, req]

  // @ts-expect-error
  res.links()
  // @ts-expect-error
  res.sendStatus('204')
  // @ts-expect-error
  res.type(1)
  // @ts-expect-error
  res.contentType(1)
  // @ts-expect-error
  res.format()
  // @ts-expect-error
  res.attachment(1)
  // @ts-expect-error
  res.append('X-A', 1)
  // @ts-expect-error
  res.set('X-A', 1)
  // @ts-expect-error
  res.header('X-A', 1)
  // @ts-expect-error
  res.get(1)
  // @ts-expect-error
  res.clearCookie(1)
  // @ts-expect-error
  res.cookie('a')
  // @ts-expect-error
  res.cookie('a', 'b', { secure: 'yes' })
  // @ts-expect-error
  res.location(1)
  // @ts-expect-error
  res.redirect('/x', 301)
  // @ts-expect-error
  res.render()
  // @ts-expect-error
  res.vary(1)
  // @ts-expect-error the path
  res.sendFile()
  // @ts-expect-error
  res.sendFile('/x', { nope: 1 })
  // @ts-expect-error
  res.download('/x', 1)
  // @ts-expect-error
  res.json({}, 200)
})

// The type parameters: body, locals, status code.
declare const typed: core.Response<{ ok: boolean }, { user: string }, 200 | 404>
typed.status(404).json({ ok: true })
typed.sendStatus(200)
exactly<string>()(typed.locals.user)
// @ts-expect-error
typed.status(500)
// @ts-expect-error
typed.sendStatus(500)
// @ts-expect-error
typed.send({ ok: 1 })
// @ts-expect-error
typed.jsonp({})
const coreSend: core.Send<{ ok: boolean }, number> = (body) => Number(body?.ok)
exactly<number>()(coreSend({ ok: true }))
const send: Send = (body) => express.response.send(body)
exactly<core.Response>()(send('text'))

// The parameters a path string gives `req.params` (RouteParameters), as
// path-to-regexp 8 parses it: what test/Router.js and path-to-regexp's own
// tests check at runtime.

import express, { type ParamsDictionary, type ParamsFlatDictionary, type RouteParameters } from 'express'
import { exactly, sameMembers } from './exact.js'

const app = express()

// named
sameMembers<{ id: string }>()({} as RouteParameters<'/users/:id'>)
sameMembers<{ id: string }>()({} as RouteParameters<':id'>)
sameMembers<{ userId: string; bookId: string }>()({} as RouteParameters<'/users/:userId/books/:bookId'>)
sameMembers<{ a: string; b: string; c: string; d: string; e: string; f: string }>()(
  {} as RouteParameters<'/:a/x/:b/y/:c/z/:d/:e/:f/edit'>
)
sameMembers<{ a_fairly_long_parameter_name_that_has_more_than_fifty_characters_in_it: string }>()(
  {} as RouteParameters<'/:a_fairly_long_parameter_name_that_has_more_than_fifty_characters_in_it/edit'>
)
sameMembers<{ $ref: string; naïve: string; a_1: string }>()({} as RouteParameters<'/:$ref/:naïve/:a_1'>)

// none
sameMembers<{}>()({} as RouteParameters<'/'>)
sameMembers<{}>()({} as RouteParameters<'/about'>)
sameMembers<{}>()({} as RouteParameters<''>)

// text right after a name
sameMembers<{ from: string; to: string }>()({} as RouteParameters<'/flights/:from-:to'>)
sameMembers<{ genus: string; species: string }>()({} as RouteParameters<'/plantae/:genus.:species'>)
sameMembers<{ id: string }>()({} as RouteParameters<'/:id.json'>)

// wildcards, alone and after others
sameMembers<{ path: string[] }>()({} as RouteParameters<'/files/*path'>)
sameMembers<{ all: string[] }>()({} as RouteParameters<'*all'>)
sameMembers<{ path: string[] }>()({} as RouteParameters<'/*path.txt'>)
sameMembers<{ id: string; rest: string[] }>()({} as RouteParameters<'/:id/*rest'>)
sameMembers<{ a: string[]; b: string[] }>()({} as RouteParameters<'/*a/x/*b'>)
sameMembers<{ id: string }>()({} as RouteParameters<'/\\*/:id'>)

// optional groups
sameMembers<{ page?: string }>()({} as RouteParameters<'/optional{/:page}'>)
sameMembers<{ a?: string; b?: string }>()({} as RouteParameters<'{/:a}{/:b}'>)
sameMembers<{ a?: string; b?: string }>()({} as RouteParameters<'/x{/:a/:b}/c'>)
sameMembers<{ a?: string; b?: string; c: string }>()({} as RouteParameters<'/a{/:a}{/:b}/:c'>)
sameMembers<{ path?: string[] }>()({} as RouteParameters<'/files{/*path}'>)
sameMembers<{ id: string; ext?: string }>()({} as RouteParameters<'/:id{.:ext}'>)
sameMembers<{ x: string; w: string }>()({} as RouteParameters<'/:x{/y}/z/:w'>)

// a path only known as a string, and a RegExp
exactly<ParamsDictionary>()({} as RouteParameters<string>)
exactly<ParamsFlatDictionary>()({} as RouteParameters<RegExp>)
sameMembers<{ id: string }>()({} as RouteParameters<`/${string}/:id`>)
sameMembers<{ id: string }>()({} as RouteParameters<`/:id/${string}`>)
sameMembers<{ [name: string]: string }>()({} as RouteParameters<`/:${string}`>)

// Express 4 syntax, which Express 5 rejects, doesn't give the name it meant
// @ts-expect-error
void ({} as RouteParameters<'/:id?'>).id
// @ts-expect-error
void ({} as RouteParameters<'/:id*'>).id
// @ts-expect-error
void ({} as RouteParameters<'/:id(\\d+)'>).id
// two names with no text between them, which path-to-regexp rejects
// @ts-expect-error
void ({} as RouteParameters<'/:a:b'>).a

// what the methods do with them
app.get('/:user/:version/*path', (req, res) => {
  exactly<string>()(req.params.user)
  exactly<string>()(req.params.version)
  exactly<string[]>()(req.params.path)
  // @ts-expect-error not in the path
  void req.params.id
  res.end()
})
app.use('/teams/:team', (req, _res, next) => {
  exactly<string>()(req.params.team)
  next()
})
app.all('/x/:id', (req, res) => {
  exactly<string>()(req.params.id)
  res.end()
})
app.route('/books/:id/*rest').get((req, res) => {
  exactly<string>()(req.params.id)
  exactly<string[]>()(req.params.rest)
  res.end()
})
app.error('/teams/:team', (_err, req, _res, next) => {
  exactly<string>()(req.params.team)
  next()
})
app.get(/^\/commits\/(?<sha>\w+)$/, (req, res) => {
  exactly<ParamsFlatDictionary>()(req.params)
  res.end()
})
// several handlers, each with the parameters, and arrays of them
app.get(
  '/y/:id',
  (req, _res, next) => {
    exactly<string>()(req.params.id)
    next()
  },
  (req, res) => {
    exactly<string>()(req.params.id)
    res.end()
  }
)
// an array of paths: which one matched isn't known
app.get(['/a/:x', '/b/*y', /^\/c/], (req, res) => {
  exactly<ParamsDictionary>()(req.params)
  res.end()
})

// A nested router with mergeParams has the parent's parameters too, which the
// path alone can't say: the types take them as a type argument.
const nested = express.Router({ mergeParams: true })
nested.get<{ team: string; member: string }>('/:member', (req, res) => {
  exactly<string>()(req.params.team)
  exactly<string>()(req.params.member)
  res.end()
})
nested.get('/:member', (req: express.Request<{ team: string; member: string }>, res) => {
  exactly<string>()(req.params.team)
  res.end()
})
nested.get('/:member', (req, res) => {
  exactly<string>()(req.params.member)
  // @ts-expect-error the parent's, which needs the type argument
  void req.params.team
  res.end()
})
app.use('/teams/:team/members', nested)

// app.param() and router.param()
app.param('id', (req, res, next, value, name) => {
  exactly<ParamsDictionary>()(req.params)
  exactly<string>()(name)
  const id: string = value
  void [res, next, id]
  next()
})
app.param(['id', 'page'], (_req, _res, next) => next())
express.Router().param('id', (_req, _res, next, value: string | string[], name: string) => {
  void [value, name]
  next()
})
// @ts-expect-error a router takes one name
express.Router().param(['id'], (_req, _res, next) => next())

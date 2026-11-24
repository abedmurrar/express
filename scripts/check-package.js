'use strict'

// Checks the package as it would be published: packs it, installs the tarball
// in an empty project (so only `dependencies` are there), and checks the file
// list, require and import, a small app and the types. The test suite runs on
// the repository, where every file and every devDependency is present.
//
//   npm run test:package

var assert = require('node:assert')
var { execFileSync } = require('node:child_process')
var fs = require('node:fs')
var { isBuiltin } = require('node:module')
var os = require('node:os')
var path = require('node:path')

var root = path.join(__dirname, '..')

// npm runs scripts with the path of its own cli.js, which needs no shell on Windows.
var npmCli = process.env.npm_execpath
if (!npmCli) {
  console.error('run it through npm: npm run test:package')
  process.exit(1)
}

function npm(args, cwd) {
  return execFileSync(process.execPath, [npmCli].concat(args), { cwd: cwd, encoding: 'utf8' })
}

function files(dir) {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(function (entry) {
      return entry.isFile()
    })
    .map(function (entry) {
      return path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')
    })
}

// Every source file compiled, every licence, the entries and the types; nothing else.
function expectedFiles() {
  return ['LICENSE', 'Readme.md', 'index.js', 'index.mjs', 'package.json']
    .concat(
      files(path.join(root, 'src'))
        .filter(function (file) {
          return !file.endsWith('.d.ts')
        })
        .map(function (file) {
          return 'lib/' + file.replace(/\.ts$/, '.js')
        }),
      files(path.join(root, 'typings')).map(function (file) {
        return 'typings/' + file
      })
    )
    .sort()
}

// The app the two module systems run. Written to the project as check.cjs and
// check.mjs, with a header that loads Express the way each one does.
var APP = `
async function main() {
  const http = require('node:http')
  assert.strictEqual(express, require('express'))
  assert.strictEqual(require('express/lib/express'), express)
  assert.strictEqual(require('express/lib/express.js'), express)
  assert.strictEqual(require('express/package.json').name, 'express')
  for (const file of libFiles) require('express/' + file)
  for (const name of ['application', 'request', 'response', 'Route', 'Router', 'json', 'raw', 'text', 'urlencoded', 'static']) {
    assert.ok(named[name], 'missing export: ' + name)
    assert.strictEqual(named[name], express[name])
  }

  const app = express()
  app.set('env', 'test') // no stack of the error below on stderr
  const router = new express.Router()
  router.get('/:id', (req, res) => res.json({ id: req.params.id, query: req.query }))
  app.use('/users', router)
  app.post('/body', express.json(), (req, res) => res.status(201).json(req.body))
  app.use('/static', express.static(__dirname))
  app.get('/file', (req, res) => res.sendFile('file.txt', { root: __dirname }))
  app.get('/throw', () => { throw new Error('boom') })

  const server = http.createServer(app).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const url = 'http://127.0.0.1:' + server.address().port
  const get = async (path, options) => {
    const res = await fetch(url + path, options)
    return [res.status, res.headers.get('content-type'), await res.text()]
  }
  try {
    const json = 'application/json; charset=utf-8'
    const html = 'text/html; charset=utf-8'
    const text = 'text/plain; charset=utf-8'
    assert.deepStrictEqual(await get('/users/7?a=1&b=2'), [200, json, '{"id":"7","query":{"a":"1","b":"2"}}'])
    const post = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":[1]}' }
    assert.deepStrictEqual(await get('/body', post), [201, json, '{"a":[1]}'])
    assert.deepStrictEqual(await get('/static/file.txt'), [200, text, 'hello'])
    assert.deepStrictEqual(await get('/file'), [200, text, 'hello'])
    const missing = await get('/missing')
    assert.deepStrictEqual(missing.slice(0, 2), [404, html])
    assert.match(missing[2], /Cannot GET \\/missing/)
    assert.strictEqual((await get('/throw'))[0], 500)
  } finally {
    server.closeAllConnections()
    server.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
`

var HEADERS = {
  'check.cjs': "const assert = require('node:assert')\nconst express = require('express')\nconst named = express\n",
  'check.mjs': [
    "import assert from 'node:assert'",
    "import { createRequire } from 'node:module'",
    "import express, * as named from 'express'",
    'const require = createRequire(import.meta.url)',
    'const __dirname = import.meta.dirname',
    ''
  ].join('\n')
}

// Compiled by this repository's tsc, against the installed declarations.
var TYPES = `
import express, { type Request, type Response, type Router, json } from 'express'

const app = express()
const router: Router = express.Router()
router.get('/:id', (req: Request, res: Response) => {
  res.json({ id: req.params.id })
})
app.use('/users', json(), router)
// @ts-expect-error a status is a number
app.get('/', (_req, res) => res.status('200'))
`

var TSCONFIG = {
  compilerOptions: {
    module: 'nodenext',
    target: 'es2022',
    lib: ['es2022'],
    types: ['node'],
    typeRoots: [path.join(root, 'node_modules', '@types')],
    strict: true,
    noEmit: true
  },
  files: ['types.cts', 'types.mts']
}

var project = fs.mkdtempSync(path.join(os.tmpdir(), 'express-package-'))

function write(name, content) {
  fs.writeFileSync(path.join(project, name), content)
}

function run(label, args) {
  execFileSync(process.execPath, args, { cwd: project, stdio: 'inherit' })
  console.log('ok: ' + label)
}

try {
  var tarball = JSON.parse(npm(['pack', '--json', '--pack-destination', project], root))[0].filename

  // The release-age window applies to what an install gets here too.
  fs.copyFileSync(path.join(root, '.npmrc'), path.join(project, '.npmrc'))
  write('package.json', '{ "name": "express-package-check", "private": true }')
  npm(['install', '--no-audit', '--no-fund', './' + tarball], project)

  var installed = path.join(project, 'node_modules', 'express')
  var packed = files(installed)
    .filter(function (file) {
      return !file.startsWith('node_modules/')
    })
    .sort()
  assert.deepStrictEqual(packed, expectedFiles())
  console.log('ok: ' + packed.length + ' files, the expected list')

  var libFiles = packed.filter(function (file) {
    return /^lib\/.*\.js$/.test(file)
  })

  // An undeclared package can still load, when another dependency brings it in.
  var required = new Set()
  libFiles.forEach(function (file) {
    var code = fs.readFileSync(path.join(installed, file), 'utf8')
    for (var match of code.matchAll(/^(?:var|const) .*\brequire\(["']([^."'][^"']*)["']\)/gm)) {
      if (!isBuiltin(match[1])) required.add(match[1])
    }
  })
  var { dependencies } = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'))
  assert.deepStrictEqual(Array.from(required).sort(), Object.keys(dependencies).sort())
  console.log('ok: ' + required.size + ' packages required, each a dependency')

  write('file.txt', 'hello')
  Object.keys(HEADERS).forEach(function (name) {
    write(name, HEADERS[name] + 'const libFiles = ' + JSON.stringify(libFiles) + '\n' + APP)
    run(name + ' (Node ' + process.version + ')', [name])
  })

  write('tsconfig.json', JSON.stringify(TSCONFIG))
  write('types.cts', TYPES)
  write('types.mts', TYPES)
  run('types', [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'])
} finally {
  fs.rmSync(project, { recursive: true, force: true, maxRetries: 5 })
}

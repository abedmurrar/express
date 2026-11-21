'use strict'

// Runs the own test suites of community middleware that test against Express,
// once with `express` pointing at the original Express 5.3.0 and once at this
// repository, and fails if any test that passes on 5.3.0 fails here. Some of
// these suites were written for Express 4, so tests that fail on 5.3.0 too are
// reported but not counted against us.
//
//   node scripts/ecosystem-suites.js [package ...]

var { execFileSync } = require('node:child_process')
var fs = require('node:fs')
var os = require('node:os')
var path = require('node:path')

var root = path.resolve(__dirname, '..')
// Outside the repo, so no config file of ours (.mocharc.yml, package.json,
// biome.json) is found by the suites' own tools looking in parent folders.
var cache = process.env.ECOSYSTEM_CACHE || path.join(os.homedir(), '.cache', 'express-fork-ecosystem')
var baseline = path.join(root, 'node_modules', 'express-baseline')

// tag: the release tag for the installed version; run: the package's own test
// command, minus lint and coverage, with a JSON reporter.
var PACKAGES = {
  cors: { repo: 'expressjs/cors', runner: 'mocha', args: ['--require', 'test/support/env'] },
  'express-session': {
    repo: 'expressjs/session',
    runner: 'mocha',
    before: ['sh', ['./test/support/gencert.sh']],
    args: ['--require', 'test/support/env', '--check-leaks', '--no-exit', 'test/']
  },
  multer: { repo: 'expressjs/multer', runner: 'mocha', args: ['--exit', '--check-leaks', 'test/'] },
  'express-rate-limit': { repo: 'express-rate-limit/express-rate-limit', runner: 'jest', args: [] }
}

function sh(cmd, args, cwd, opts) {
  return execFileSync(
    cmd,
    args,
    Object.assign({ cwd: cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }, opts)
  )
}

function installedVersion(name) {
  return JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version
}

function checkout(name, spec) {
  var version = installedVersion(name)
  var dir = path.join(cache, name + '-' + version)
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    fs.mkdirSync(cache, { recursive: true })
    var url = 'https://github.com/' + spec.repo + '.git'
    try {
      sh(
        'git',
        ['-c', 'advice.detachedHead=false', 'clone', '-q', '--depth', '1', '--branch', 'v' + version, url, dir],
        root
      )
    } catch {
      sh('git', ['-c', 'advice.detachedHead=false', 'clone', '-q', '--depth', '1', '--branch', version, url, dir], root)
    }
    sh('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'], dir)
    if (spec.before) sh(spec.before[0], spec.before[1], dir)
  }
  return { dir: dir, version: version }
}

// Point the package's `express` at a directory (installed as a link).
function useExpress(dir, expressDir) {
  sh(
    'npm',
    ['install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', expressDir],
    dir
  )
  var linked = fs.realpathSync(path.join(dir, 'node_modules', 'express'))
  if (linked !== fs.realpathSync(expressDir)) throw new Error('express in ' + dir + ' did not link to ' + expressDir)
}

// Run the suite and return a map of test title -> 'passed' | 'failed'.
function runSuite(dir, spec) {
  var out
  var bin = path.join(dir, 'node_modules', '.bin', spec.runner)
  var args =
    spec.runner === 'mocha'
      ? ['--no-config'].concat(spec.args, ['--reporter', 'json'])
      : spec.args.concat(['--json', '--silent'])
  try {
    out = sh(bin, args, dir, { env: Object.assign({}, process.env, { NODE_ENV: 'test', FORCE_COLOR: '0' }) })
  } catch (err) {
    out = err.stdout // a non-zero exit only means some tests failed
  }
  var json = JSON.parse(out.slice(out.indexOf('{')))
  var results = {}
  if (spec.runner === 'mocha') {
    json.passes.forEach(function (t) {
      results[t.fullTitle] = 'passed'
    })
    json.failures.forEach(function (t) {
      results[t.fullTitle] = 'failed'
    })
  } else {
    json.testResults.forEach(function (file) {
      file.assertionResults.forEach(function (t) {
        if (t.status === 'passed' || t.status === 'failed') results[t.fullName] = t.status
      })
    })
  }
  return results
}

function main() {
  var names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PACKAGES)
  var problems = 0
  names.forEach(function (name) {
    var spec = PACKAGES[name]
    if (!spec) throw new Error('unknown package: ' + name)
    var co = checkout(name, spec)
    useExpress(co.dir, baseline)
    var before = runSuite(co.dir, spec)
    useExpress(co.dir, root)
    var after = runSuite(co.dir, spec)
    var titles = Object.keys(before)
    var regressed = titles.filter(function (t) {
      return before[t] === 'passed' && after[t] !== 'passed'
    })
    var alsoFailOn530 = titles.filter(function (t) {
      return before[t] === 'failed'
    })
    var missing = titles.filter(function (t) {
      return !(t in after)
    })
    var passed = titles.length - alsoFailOn530.length
    console.log(
      name +
        '@' +
        co.version +
        ': ' +
        titles.length +
        ' tests; ' +
        passed +
        ' pass on Express 5.3.0; ' +
        (passed - regressed.length) +
        ' of those pass on this fork' +
        (alsoFailOn530.length ? '; ' + alsoFailOn530.length + ' fail on 5.3.0 as well (written for Express 4)' : '')
    )
    regressed.concat(missing).forEach(function (t) {
      console.log('  REGRESSION: ' + t)
    })
    problems += regressed.length + missing.length
  })
  if (problems) {
    console.log(problems + ' test(s) pass on Express 5.3.0 but not on this fork')
    process.exit(1)
  }
}

main()

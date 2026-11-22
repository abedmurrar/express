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

// Each suite runs at the release tag for the installed version, with the
// package's own test command minus lint and coverage and with a JSON reporter.
// runner: mocha, jest or vitest; args: the runner's arguments; before: a setup
// command run once after checkout; pretest: one run before every suite run;
// lockfile: install with `npm ci` from the package's own lock file.
var PACKAGES = {
  cors: { repo: 'expressjs/cors', runner: 'mocha', args: ['--require', 'test/support/env'] },
  'express-session': {
    repo: 'expressjs/session',
    runner: 'mocha',
    before: ['sh', ['./test/support/gencert.sh']],
    args: ['--require', 'test/support/env', '--check-leaks', '--no-exit', 'test/']
  },
  multer: { repo: 'expressjs/multer', runner: 'mocha', args: ['--exit', '--check-leaks', 'test/'] },
  'express-rate-limit': { repo: 'express-rate-limit/express-rate-limit', runner: 'jest', args: [] },
  'http-proxy-middleware': { repo: 'chimurai/http-proxy-middleware', runner: 'vitest', args: [] },
  'express-basic-auth': { repo: 'LionC/express-basic-auth', runner: 'mocha', args: ['test.js'] },
  // Its tests need the versions in its lock file (js-yaml 3, TypeScript 5.8).
  // ts-node only strips types here: this repository ships its own, which, like
  // @types/express-serve-static-core 5.1, its sources don't compile against
  // (its lock file has 5.0), and this suite compares runtime behaviour.
  'express-openapi-validator': {
    repo: 'cdimascio/express-openapi-validator',
    runner: 'mocha',
    lockfile: true,
    args: [
      '--require',
      'source-map-support/register',
      '--require',
      'ts-node/register/transpile-only',
      '--files',
      '--recursive',
      'test/**/*.spec.ts',
      'test/*.spec.ts'
    ]
  },
  'express-fileupload': {
    repo: 'richardgirges/express-fileupload',
    runner: 'mocha',
    // Some tests move the generated fixtures away, so they are made again before each run.
    pretest: ['node', ['test/pretests.js']],
    args: ['test/**/*.spec.js']
  },
  'express-mongo-sanitize': { repo: 'fiznool/express-mongo-sanitize', runner: 'mocha', args: ['test.js'] },
  // Its gulpfile sets `global.expect` before running mocha on test/spec.
  hpp: {
    repo: 'analog-nico/hpp',
    runner: 'mocha',
    before: ['sh', ['-c', 'echo "global.expect = require(\'chai\').expect" > test/expect.js']],
    args: ['--require', './test/expect.js', 'test/spec/']
  }
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
    var install = spec.lockfile ? ['ci'] : ['install', '--no-package-lock']
    sh('npm', install.concat(['--ignore-scripts', '--no-audit', '--no-fund']), dir)
    if (spec.before) sh(spec.before[0], spec.before[1], dir)
  }
  return { dir: dir, version: version }
}

// Point the package's `express` at a directory (installed as a link).
// With a lock file, npm keeps the locked versions of everything else.
function useExpress(dir, spec, expressDir) {
  var keep = spec.lockfile ? [] : ['--no-package-lock']
  sh('npm', ['install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund'].concat(keep, [expressDir]), dir)
  var linked = fs.realpathSync(path.join(dir, 'node_modules', 'express'))
  if (linked !== fs.realpathSync(expressDir)) throw new Error('express in ' + dir + ' did not link to ' + expressDir)
}

// Run the suite and return a map of test title -> 'passed' | 'failed'.
function runSuite(dir, spec) {
  var out
  if (spec.pretest) sh(spec.pretest[0], spec.pretest[1], dir)
  var bin = path.join(dir, 'node_modules', '.bin', spec.runner)
  // The JSON report goes to a file, so what the tests print can't corrupt it.
  // Vitest's report has the same shape as Jest's. Mocha before 9 can only
  // print it, after anything the tests print.
  var report = path.join(dir, 'ecosystem-report.json')
  var args = {
    mocha: ['--no-config'].concat(spec.args, ['--reporter', 'json', '--reporter-options', 'output=' + report]),
    jest: spec.args.concat(['--json', '--outputFile', report, '--silent']),
    vitest: ['run'].concat(spec.args, ['--reporter', 'json', '--outputFile', report, '--silent'])
  }[spec.runner]
  fs.rmSync(report, { force: true })
  try {
    out = sh(bin, args, dir, { env: Object.assign({}, process.env, { NODE_ENV: 'test', FORCE_COLOR: '0' }) })
  } catch (err) {
    out = err.stdout // a non-zero exit only means some tests failed
    if (!fs.existsSync(report) && out.indexOf('{') === -1)
      throw new Error('no test report from ' + dir + ':\n' + err.stderr)
  }
  var json = fs.existsSync(report)
    ? JSON.parse(fs.readFileSync(report, 'utf8'))
    : JSON.parse(out.slice(out.lastIndexOf('{\n  "stats"')))
  var results = {}
  // A title used by more than one test gets a number, so each one is compared.
  function add(title, status) {
    var key = title
    for (var n = 2; key in results; n++) key = title + ' (' + n + ')'
    results[key] = status
  }
  if (spec.runner === 'mocha') {
    json.passes.forEach(function (t) {
      add(t.fullTitle, 'passed')
    })
    json.failures.forEach(function (t) {
      add(t.fullTitle, 'failed')
    })
  } else {
    json.testResults.forEach(function (file) {
      file.assertionResults.forEach(function (t) {
        if (t.status === 'passed' || t.status === 'failed') add(t.fullName, t.status)
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
    useExpress(co.dir, spec, baseline)
    var before = runSuite(co.dir, spec)
    useExpress(co.dir, spec, root)
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

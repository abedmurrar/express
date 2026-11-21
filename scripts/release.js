'use strict'

// Prepares a release: checks, bumps the version, dates History.md, commits
// and tags. Pushing the tag starts .github/workflows/release.yml, which runs
// CI and publishes. Nothing is pushed by this script. See RELEASING.md.
//
//   npm run release -- <version|patch|minor|major|prerelease|prepatch|preminor|premajor> [--dry-run]
//
// Adapted from the objection fork (abedmurrar/objection.js, scripts/release.js).

var { execFileSync } = require('node:child_process')
var fs = require('node:fs')
var path = require('node:path')
var changelog = require('./changelog')

var root = path.join(__dirname, '..')
var RELEASE_BRANCH = 'master'
var INCREMENTS = ['patch', 'minor', 'major', 'prerelease', 'prepatch', 'preminor', 'premajor']

function run(cmd, args, opts) {
  var out = execFileSync(cmd, args, Object.assign({ cwd: root, encoding: 'utf8' }, opts))
  return out === null ? '' : out.trim()
}

function fail(message) {
  console.error('release: ' + message)
  process.exit(1)
}

function currentVersion() {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
}

function preid(version) {
  var match = /-([a-z]+)\./.exec(version)
  return match ? match[1] : 'fork'
}

function main() {
  var args = process.argv.slice(2)
  var dryRun = args.includes('--dry-run')
  var target = args.find(function (a) {
    return !a.startsWith('--')
  })

  if (!target || !(INCREMENTS.includes(target) || /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(target))) {
    fail('usage: npm run release -- <version|' + INCREMENTS.join('|') + '> [--dry-run]')
  }

  var branch = run('git', ['branch', '--show-current'])
  if (branch !== RELEASE_BRANCH && !dryRun)
    fail('releases are made from "' + RELEASE_BRANCH + '", not "' + branch + '"')
  if (run('git', ['status', '--porcelain']) !== '' && !dryRun) fail('the working tree has uncommitted changes')

  var notes = changelog.unreleasedNotes(changelog.read())
  if (!notes) fail('the "Unreleased (fork)" section of History.md is empty')

  console.log('Checking lint and tests. The full matrix runs again in CI on the tag.')
  var checks = [
    ['npm', ['run', 'lint']],
    ['npm', ['test']]
  ]
  for (var check of checks) {
    try {
      run(check[0], check[1], { stdio: 'inherit' })
    } catch {
      fail('"' + check[0] + ' ' + check[1].join(' ') + '" failed')
    }
  }

  var from = currentVersion()
  var versionArgs = ['version', target, '--no-git-tag-version', '--preid', preid(from)]

  if (dryRun) {
    console.log('\nDry run: would run "npm ' + versionArgs.join(' ') + '" (now ' + from + '),')
    console.log('date History.md, commit "Release v<version>" and tag it. Notes:\n')
    console.log(notes)
    return
  }

  run('npm', versionArgs)
  var version = currentVersion()
  var date = new Date().toISOString().slice(0, 10)
  changelog.write(changelog.release(changelog.read(), version, date))

  run('git', ['add', 'package.json', changelog.historyPath])
  run('git', ['commit', '-m', 'Release v' + version])
  run('git', ['tag', '-a', 'v' + version, '-m', 'v' + version])

  var distTag = version.includes('-') ? 'next' : 'latest'
  console.log(
    '\nCommitted and tagged v' + version + ' (' + from + ' -> ' + version + ', npm dist-tag "' + distTag + '").'
  )
  console.log('Nothing was pushed. To publish:\n\n  git push origin ' + RELEASE_BRANCH + ' --follow-tags\n')
  console.log('To undo instead:\n\n  git tag -d v' + version + ' && git reset --hard HEAD~1')
}

main()

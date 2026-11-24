'use strict'

// Vitest runs every test file under test/, with the same exclusions as the old
// .mocharc.yml. test/support/vitest-setup.js gives the suite mocha's API
// (done callbacks, before/after, `this.timeout` and `this.skip`, the global
// leak check), so the test bodies are unchanged from the mocha days.

const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    globals: true,
    // Threads, not forks: c8 collects V8 coverage from this process, and forked
    // workers are stopped before Node can write theirs.
    pool: 'threads',
    include: ['test/**/*.js'],
    exclude: [
      'test/**/support/**',
      'test/**/fixtures/**',
      'test/**/support.js',
      'test/differential/scenarios.js',
      'test/differential/generated.js',
      '**/node_modules/**'
    ],
    setupFiles: ['test/support/env.js', 'test/support/vitest-setup.js'],
    testTimeout: 10000,
    hookTimeout: 10000
  }
})

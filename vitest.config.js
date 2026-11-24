'use strict'

// Vitest runs every test file under test/, with the same exclusions as the old
// .mocharc.yml. test/support/vitest-setup.js gives the suite mocha's API
// (done callbacks, before/after, `this.timeout` and `this.skip`, the global
// leak check), so the test bodies are unchanged from the mocha days.

const path = require('node:path')
const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    globals: true,
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
    hookTimeout: 10000,
    // Measured with `--coverage` (npm run test-ci): the built lib/, reported on
    // src/ through the source maps. Each side of `&&`, `||`, `??` and `?:` and
    // a missing `else` counts as a branch.
    coverage: {
      // @vitest/coverage-v8, with a fix: see the file.
      provider: 'custom',
      customProviderModule: path.join(__dirname, 'test', 'support', 'coverage-provider.mjs'),
      // The tests also run Express in child processes.
      autoAttachSubprocess: true,
      include: ['index.js', 'index.mjs', 'lib/**/*.js'],
      reporter: ['text', 'lcovonly'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 }
    }
  }
})

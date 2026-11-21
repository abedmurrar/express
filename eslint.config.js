'use strict'

// ESLint flat config. It carries over the old .eslintrc.yml exactly (including
// ESLint 8's `caughtErrors: 'none'` default, which ESLint 9 changed): the same
// six rules, ES2022, Node globals and CommonJS (which allows a top-level
// return). The three formatting rules are deprecated in ESLint 10 but still
// built in; they move to @stylistic/eslint-plugin when ESLint removes them.

var globals = require('globals')

module.exports = [
  {
    ignores: ['coverage/**', 'research/**', 'benchmarks/compare/node_modules/**', 'benchmarks/compare/.refs/**']
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: Object.assign({}, globals.es2021, globals.node)
    },
    linterOptions: {
      // the old setup did not report unused disable comments either
      reportUnusedDisableDirectives: 'off'
    },
    rules: {
      'eol-last': 'error',
      eqeqeq: ['error', 'allow-null'],
      indent: ['error', 2, { MemberExpression: 'off', SwitchCase: 1 }],
      'no-trailing-spaces': 'error',
      'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-restricted-globals': [
        'error',
        {
          name: 'Buffer',
          message: 'Use `import { Buffer } from "node:buffer"` instead of the global Buffer.'
        }
      ]
    }
  }
]

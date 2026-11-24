'use strict'

// Checks that the type tests (test/types) cover the whole public API: every
// declaration in typings/ (each export, member, option and overload) has to be
// used by a test. Lists the ones that aren't.
//
// It asks a TypeScript compiler what each name and call in the tests resolves
// to, so a call counts for the overload it picks, and an option for the options
// type it is given to. TypeScript 7 has no compiler API for this; the 5.9 that
// `npm run test:types:ts5:install` installs has. Lines under @ts-expect-error
// don't count.

var fs = require('node:fs')
var path = require('node:path')

var root = path.join(__dirname, '..')
var tests = path.join(root, 'test', 'types')
var typings = path.join(root, 'typings')
var compiler = path.join(tests, 'ts5', 'node_modules', 'typescript-5.9')

if (!fs.existsSync(compiler)) {
  console.error('TypeScript 5.9 is not installed: run `npm run test:types:ts5:install`')
  process.exit(1)
}

var ts = require(compiler)
var config = ts.getParsedCommandLineOfConfigFile(
  path.join(tests, 'tsconfig.json'),
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: function (diagnostic) {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
    }
  }
)
var program = ts.createProgram(config.fileNames, config.options)
var checker = program.getTypeChecker()

// The overloads no call can pick, because one before them takes the same
// arguments. As in @types/express; they are numbered as in the declarations.
var unreachable = [
  'IRouterMatcher overload 5',
  'IRouterHandler overload 5',
  'IRouterHandler overload 6',
  'Response.render overload 2',
  'Application.render overload 2'
]

/** Every public declaration, and whether a test uses it. */
var declared = new Map()

program.getSourceFiles().forEach(function (file) {
  if (path.dirname(path.normalize(file.fileName)) === typings) declare(file)
})
program.getSourceFiles().forEach(function (file) {
  if (config.fileNames.indexOf(file.fileName) !== -1) use(file, expectedErrors(file))
})

var unused = []
var problems = []

declared.forEach(function (used, node) {
  if (!used) unused.push(node)
})
unused.forEach(function (node) {
  var file = node.getSourceFile()
  var at = file.getLineAndCharacterOfPosition(node.getStart())

  if (unreachable.indexOf(name(node)) === -1) {
    problems.push(path.relative(root, file.fileName) + ':' + (at.line + 1) + ': no type test uses ' + name(node))
  }
})
unreachable.forEach(function (overload) {
  if (unused.map(name).indexOf(overload) === -1)
    problems.push(overload + ' is listed as unreachable, but is used or gone')
})
// index.d.mts exports by name what index.d.ts has
var named = exportsOf('index.d.mts')
exportsOf('index.d.ts').forEach(function (name) {
  if (named.indexOf(name) === -1) problems.push("index.d.mts doesn't export " + name)
})

console.log(declared.size - unused.length + ' of ' + declared.size + ' public declarations have a type test')
console.log(unreachable.length + ' overloads are unreachable')
problems.forEach(function (problem) {
  console.error(problem)
})
if (declared.size === 0 || problems.length > 0) process.exitCode = 1

function exportsOf(basename) {
  var file = program.getSourceFile(path.join(typings, basename))
  return checker.getExportsOfModule(checker.getSymbolAtLocation(file)).map(function (symbol) {
    return symbol.name
  })
}

function isSignature(node) {
  return (
    ts.isMethodSignature(node) ||
    ts.isCallSignatureDeclaration(node) ||
    ts.isConstructSignatureDeclaration(node) ||
    ts.isFunctionDeclaration(node)
  )
}

/** Collects the public declarations in `node`. */
function declare(node) {
  var exported =
    (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isFunctionDeclaration(node)) &&
    // everything in the namespaces of a declaration file is exported
    (ts.isModuleBlock(node.parent) || ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export)

  if (exported || ts.isPropertySignature(node) || isSignature(node) || ts.isVariableDeclaration(node)) {
    declared.set(node, false)
  }
  ts.forEachChild(node, declare)
}

/** The 0-based lines that follow an `@ts-expect-error` comment. */
function expectedErrors(file) {
  var lines = new Set()
  file.text.split('\n').forEach(function (line, i) {
    if (/^\s*\/\/ @ts-expect-error/.test(line)) lines.add(i + 1)
  })
  return lines
}

/** Marks what `node` uses. */
function use(node, skip) {
  var line = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line

  if (!skip.has(line)) {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      var signature = checker.getResolvedSignature(node)
      if (signature && signature.declaration) mark(signature.declaration)
    } else if (ts.isObjectLiteralElementLike(node) && node.name) {
      var context = checker.getContextualType(node.parent)
      // a method given to an option is a use of it, as it is the only overload
      if (context) markSymbol(checker.getNonNullableType(context).getProperty(node.name.text), true)
    } else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
      var property = node.propertyName || node.name
      if (ts.isIdentifier(property)) markSymbol(checker.getTypeAtLocation(node.parent).getProperty(property.text))
    } else if (ts.isIdentifier(node) || ts.isStringLiteral(node)) {
      markSymbol(checker.getSymbolAtLocation(node))
    }
  }
  ts.forEachChild(node, function (child) {
    use(child, skip)
  })
}

function mark(declaration) {
  if (declared.has(declaration)) declared.set(declaration, true)
}

function markSymbol(symbol, methods) {
  if (!symbol) return
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
  ;(symbol.declarations || []).forEach(function (declaration) {
    // a method counts for the overload a call picks
    if (methods || !isSignature(declaration)) mark(declaration)
  })
}

/** `Request.get overload 2`, or `Request.ip`: the overload only when there are several. */
function name(node) {
  var names = []

  // `e` is the namespace index.d.ts exports
  for (var at = node; at && !ts.isSourceFile(at); at = at.parent) {
    if (at.name && at.name.text !== 'e') names.unshift(at.name.getText())
  }

  var overloads = isSignature(node) && node.parent.members ? node.parent.members.filter(isOverloadOf) : []

  function isOverloadOf(other) {
    return other.kind === node.kind && (other.name && other.name.getText()) === (node.name && node.name.getText())
  }

  return names.join('.') + (overloads.length > 1 ? ' overload ' + (overloads.indexOf(node) + 1) : '')
}

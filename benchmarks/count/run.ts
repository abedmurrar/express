// Compares two Express checkouts by the CPU instructions each scenario
// executes per request. Unlike times, instruction counts barely depend on what
// else runs on the machine, so CI can fail a pull request that makes Express
// do more work. See benchmarks/count/README.md.
//
// The method, the Node flags and the CI setup come from bench/count.js in the
// objection.js fork (github.com/abedmurrar/objection.js).
//
//   node benchmarks/count/run.ts                          # HEAD vs merge-base with origin/master
//   node benchmarks/count/run.ts --against master --max-change 1
//   node benchmarks/count/run.ts --baseline ../other-checkout --scenarios hello,json
//   node benchmarks/count/run.ts --counter valgrind --runs 1 --jobs 4
//
// The head is this working tree, uncommitted changes included. The baseline is
// a temporary git worktree at `git merge-base HEAD <--against>`, so the two
// differ by exactly this branch's changes, or the checkout given by
// `--baseline`.
//
// Each scenario runs `--warmup` and `--warmup` + `requests` requests, each in a
// new process, and the difference divided by `requests` is the count per
// request, without Node's startup and the warm-up. The number of requests is
// chosen per scenario for about `--target` instructions, and both checkouts
// send the same number.
//
// The warm-up is a fixed 30,000 requests, not a share of the measured ones: V8
// keeps compiling Express's request path to optimized code until about 20,000
// requests (31,000 for post-json, with a few single functions later), and
// compiling one function costs as much as dozens of requests. A measured window
// that still contains compiling counts a moving target.
//
// With `--max-change`, it exits with 1 when a scenario executes more than that
// many percent more instructions per request than the baseline. A scenario
// over the limit is measured twice more, and fails only if the median of the
// three is still over it. `--report-only` reports the scenarios over the limit
// the same way but exits with 0.

import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { SCENARIOS } from './scenarios.ts'
import type { Scenario } from './scenarios.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')

const { values: args } = parseArgs({
  options: {
    against: { type: 'string', default: 'origin/master' },
    baseline: { type: 'string' },
    scenarios: { type: 'string', default: SCENARIOS.join(',') },
    counter: { type: 'string', default: 'perf' },
    runs: { type: 'string', default: '2' },
    target: { type: 'string', default: '1e9' },
    warmup: { type: 'string', default: '30000' },
    'max-change': { type: 'string' },
    jobs: { type: 'string', default: '1' },
    'keep-base': { type: 'boolean', default: false },
    'report-only': { type: 'boolean', default: false }
  }
})

const runs = Number(args.runs)
const target = Number(args.target)
const warmup = Number(args.warmup)
const jobs = Math.max(1, Number(args.jobs))
const maxChange = args['max-change'] === undefined ? undefined : Number(args['max-change'])
const scenarios = args.scenarios.split(',') as Scenario[]

for (const scenario of scenarios) {
  if (!SCENARIOS.includes(scenario)) throw new Error(`Unknown scenario ${scenario}, use ${SCENARIOS.join(', ')}`)
}

interface Counter {
  command: string
  args: string[]
  parse(stderr: string): number
}

const COUNTERS: Record<string, Counter> = {
  // Needs `kernel.perf_event_paranoid` <= 2 (`sudo sysctl kernel.perf_event_paranoid=2`).
  perf: {
    command: 'perf',
    args: ['stat', '-x,', '-e', 'instructions:u'],
    // A line `<count>,,instructions:u,...`.
    parse(stderr) {
      const line = stderr.split('\n').find((l) => l.includes('instructions:u'))
      return line === undefined ? Number.NaN : Number(line.split(',')[0])
    }
  },
  // For machines without hardware counters, like GitHub's runners. Slower, but
  // counts the same code the same way every time.
  valgrind: {
    command: 'valgrind',
    args: ['--tool=cachegrind', '--cache-sim=no', '--cachegrind-out-file=/dev/null'],
    // A line `==<pid>== I refs:   874,179,742`.
    parse(stderr) {
      const match = /I\s+refs:\s+([\d,]+)/.exec(stderr)
      return match?.[1] === undefined ? Number.NaN : Number(match[1].replaceAll(',', ''))
    }
  }
}

const counter: Counter =
  COUNTERS[args.counter] ??
  ((): never => {
    throw new Error(`Unknown --counter ${args.counter}, use ${Object.keys(COUNTERS).join(' or ')}`)
  })()

const NODE_FLAGS = [
  // The counts include every thread, and V8's background compiler and GC
  // threads would otherwise add a varying amount.
  '--single-threaded',
  // V8 shrinks the young generation when it measures a low allocation rate in
  // bytes per millisecond, a wall-clock measure: under valgrind, Node's
  // startup is slow enough to trigger it, more or less often depending on the
  // machine's load, so the number of scavenges differs from run to run.
  // `--predictable` turns that time-based shrinking off, and the memory
  // reducer, which is also timed. It doesn't fix the young generation's size:
  // it still grows with what survives, as it does without valgrind.
  '--predictable',
  // The same hash and random seeds in every process, so both checkouts build
  // the same hash tables.
  '--hash-seed=1',
  '--random-seed=1',
  // No full garbage collection inside the measured requests of one checkout and
  // not the other: an old generation larger than any scenario needs. And no
  // allocation-site pretenuring, which V8 turns on or off depending on which
  // scavenges it happens to run. In the objection fork, these two moved
  // scenarios by 7-15% without them. The young generation is left to V8: fixing
  // its size made small operations count 28-43% more instructions there.
  '--initial-old-space-size=512',
  '--no-allocation-site-pretenuring'
]

function count(scenario: Scenario, dir: string, requests: number): Promise<number> {
  const argv = [
    ...counter.args,
    process.execPath,
    ...NODE_FLAGS,
    path.join(here, 'worker.ts'),
    scenario,
    dir,
    String(requests)
  ]
  return new Promise((resolve, reject) => {
    const proc = spawn(counter.command, argv, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    // The counter prints its count, and the worker its errors, to stderr.
    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', (data: string) => {
      stderr += data
    })
    proc.on('error', reject)
    proc.on('close', (status) => {
      const value = counter.parse(stderr)
      if (status !== 0 || Number.isNaN(value)) reject(new Error(`${scenario} in ${dir} failed:\n${stderr}`))
      else resolve(value)
    })
  })
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

function format(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}k`
  return n.toFixed(0)
}

// The number of requests for about `target` instructions, from a short run
// after the warm-up.
async function requestsFor(scenario: Scenario, dir: string): Promise<number> {
  const probe = 2000
  const estimate = ((await count(scenario, dir, warmup + probe)) - (await count(scenario, dir, warmup))) / probe
  return Math.min(200000, Math.max(1000, Math.round(target / Math.max(estimate, 1))))
}

async function perRequest(scenario: Scenario, dir: string, requests: number): Promise<number[]> {
  const values: number[] = []
  for (let run = 0; run < runs; run++) {
    const base = await count(scenario, dir, warmup)
    const full = await count(scenario, dir, warmup + requests)
    values.push((full - base) / requests)
  }
  return values
}

interface Result {
  scenario: Scenario
  before: number
  after: number
}

async function measure(scenario: Scenario, baseline: string): Promise<Result> {
  const requests = await requestsFor(scenario, baseline)
  const before = await perRequest(scenario, baseline, requests)
  const after = await perRequest(scenario, repo, requests)
  const list = (values: number[]): string => (values.length > 1 ? ` [${values.map(format).join(', ')}]` : '')
  console.error(
    `${scenario}: ${format(median(before))}${list(before)} -> ${format(median(after))}${list(after)} instructions/request (${requests} requests)`
  )
  return { scenario, before: median(before), after: median(after) }
}

function changeOf({ before, after }: Result): number {
  return ((after - before) / before) * 100
}

// Runs `fn` for every item, at most `limit` at a time, keeping the order.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function work(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, work))
  return results
}

function git(...argv: string[]): string {
  return execFileSync('git', argv, { cwd: repo, encoding: 'utf8' }).trim()
}

// A worktree of the merge-base, at a path as long as this checkout's: file
// paths end up in strings that Node hashes and copies, so a different length
// could count differently.
function addBaseline(sha: string): string {
  const prefix = path.join(os.tmpdir(), 'express-count-')
  const fill = repo.length - prefix.length - 6 // mkdtemp adds 6 characters
  if (fill < 0) throw new Error(`${repo} is shorter than a temporary directory; pass --baseline`)
  const dir = mkdtempSync(prefix + 'b'.repeat(fill))
  git('worktree', 'add', '--detach', '--quiet', dir, sha)
  // The same dependencies, at the same paths, for both.
  symlinkSync(path.join(repo, 'node_modules'), path.join(dir, 'node_modules'))
  build(dir)
  return dir
}

// Once the sources live in src/ (PR #30), `npm run build` writes the lib/ that
// the package loads. Before that there is no build script, and nothing to do.
// The same as benchmarks/compare/run.ts.
function build(dir: string): void {
  execFileSync('npm', ['run', 'build', '--if-present'], { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] })
}

function table(rows: string[][]): string {
  const [header, ...body] = rows as [string[], ...string[][]]
  const line = (cells: string[]): string => `| ${cells.join(' | ')} |`
  return [line(header), line(header.map(() => '---')), ...body.map(line)].join('\n')
}

async function main(): Promise<void> {
  let baseline = args.baseline === undefined ? undefined : path.resolve(args.baseline)
  let baseName = baseline ?? ''
  let cleanup = (): void => {}
  if (baseline === undefined) {
    const sha = git('merge-base', 'HEAD', args.against)
    baseline = addBaseline(sha)
    baseName = `merge-base ${sha.slice(0, 8)} (${args.against})`
    const dir = baseline
    cleanup = () => {
      if (args['keep-base']) console.error(`Kept the baseline at ${dir}`)
      else {
        git('worktree', 'remove', '--force', dir)
        rmSync(dir, { recursive: true, force: true })
      }
    }
  }
  const base = baseline
  build(repo)
  const head = `HEAD ${git('rev-parse', '--short=8', 'HEAD')}${git('status', '--porcelain', '--', 'src', 'lib', 'index.js', 'package.json') === '' ? '' : ' + changes'}`
  console.error(`Counting instructions with ${args.counter}: ${baseName} -> ${head}`)

  let results: Result[]
  try {
    results = await mapLimit(scenarios, jobs, (scenario) => measure(scenario, base))
    if (maxChange !== undefined) {
      const over = results.filter((result) => changeOf(result) > maxChange)
      await mapLimit(over, jobs, async (result) => {
        console.error(`${result.scenario}: over the limit, measuring twice more`)
        const more = [await measure(result.scenario, base), await measure(result.scenario, base)]
        result.before = median([result.before, ...more.map((it) => it.before)])
        result.after = median([result.after, ...more.map((it) => it.after)])
      })
    }
  } finally {
    cleanup()
  }

  const rows = [['scenario', 'baseline', 'head', 'change']]
  const tooSlow: string[] = []
  for (const result of results) {
    const change = changeOf(result)
    if (maxChange !== undefined && change > maxChange) {
      tooSlow.push(`${result.scenario}: +${change.toFixed(2)}% (limit ${maxChange}%)`)
    }
    rows.push([
      result.scenario,
      format(result.before),
      format(result.after),
      `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`
    ])
  }

  const report = [
    `Instructions per request (user space, ${args.counter}): ${baseName} -> ${head}`,
    '',
    table(rows),
    '',
    tooSlow.length === 0
      ? maxChange === undefined
        ? 'No limit was checked.'
        : `Every scenario is within ${maxChange}%.`
      : `More instructions than allowed${args['report-only'] ? ' (report only, not failing)' : ''}:\n\n${tooSlow.map((l) => `- ${l}`).join('\n')}`
  ].join('\n')
  console.log(`\n${report}`)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Instruction count\n\n${report}\n`)
  if (tooSlow.length > 0 && !args['report-only']) process.exitCode = 1
}

await main()

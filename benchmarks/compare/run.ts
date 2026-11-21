// Benchmarks this repository against the original Express and other
// frameworks. One full run per PR; see benchmarks/compare/README.md.
//
//   node benchmarks/compare/run.ts [--against <ref>] [--rounds 3] [--duration 5]
//     [--warmup 2] [--connections 50] [--targets a,b] [--scenarios a,b]
//     [--name <results name>] [--quick] [--keep-base]

import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import autocannon from 'autocannon'
import { CHECKS, SCENARIOS } from './servers.ts'
import type { Framework, Scenario } from './servers.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const PORT = 39181
// The server under test gets one physical core (CPU 0 and its hyper-thread
// siblings, read from the kernel's topology); the load generator gets every
// other CPU. Works on this laptop (8 threads) and on CI runners (4 vCPUs).
function parseCpuList (list: string): number[] {
  return list.trim().split(',').flatMap((part) => {
    const [a, b] = part.split('-').map(Number)
    if (a === undefined || Number.isNaN(a)) return []
    return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i)
  })
}

function cpuLayout (): { server: string, load: string } | undefined {
  const all = os.cpus().map((_, i) => i)
  let siblings = [0]
  try {
    siblings = parseCpuList(readFileSync('/sys/devices/system/cpu/cpu0/topology/thread_siblings_list', 'utf8'))
  } catch {
    // no topology information: give the server CPU 0 only
  }
  const load = all.filter((c) => !siblings.includes(c))
  if (load.length === 0) return undefined
  return { server: siblings.join(','), load: load.join(',') }
}

interface Target {
  name: string
  framework: Framework
  dir?: string
}

interface Sample { rps: number, p50: number, p99: number, errors: number, unexpected: number }

interface Row {
  scenario: Scenario
  target: string
  rps: number
  p50: number
  p99: number
  runs: number[]
  failed?: string
}

const { values: args } = parseArgs({
  options: {
    against: { type: 'string', default: 'master' },
    rounds: { type: 'string' },
    duration: { type: 'string' },
    warmup: { type: 'string', default: '2' },
    connections: { type: 'string', default: '50' },
    targets: { type: 'string' },
    scenarios: { type: 'string' },
    name: { type: 'string' },
    quick: { type: 'boolean', default: false },
    'keep-base': { type: 'boolean', default: false }
  }
})

const quick = args.quick
const rounds = Number(args.rounds ?? (quick ? '1' : '3'))
const duration = Number(args.duration ?? (quick ? '3' : '5'))
const warmup = Number(args.warmup)
const connections = Number(args.connections)

function git (...argv: string[]): string {
  return execFileSync('git', argv, { cwd: repo, encoding: 'utf8' }).trim()
}

const layout = cpuLayout()
const hasTaskset = layout !== undefined && (() => {
  try { execFileSync('taskset', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
})()

const baseSha = git('rev-parse', '--short=8', args.against)
const headSha = git('rev-parse', '--short=8', 'HEAD')
const dirty = git('status', '--porcelain', '--', 'lib', 'index.js', 'package.json') !== ''
const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
const baseDir = path.join(here, '.refs', baseSha)

const ALL: Target[] = [
  { name: 'express 5.3.0 (npm)', framework: 'express' },
  { name: `base ${args.against} (${baseSha})`, framework: 'express', dir: baseDir },
  { name: `head ${branch} (${headSha}${dirty ? ', uncommitted changes' : ''})`, framework: 'express', dir: repo },
  { name: 'fastify', framework: 'fastify' },
  { name: 'koa', framework: 'koa' },
  { name: 'hono', framework: 'hono' },
  { name: 'polka', framework: 'polka' },
  { name: 'node:http', framework: 'node-http' }
]
const KEYS = ['original', 'base', 'head', 'fastify', 'koa', 'hono', 'polka', 'node-http'] as const
const pick = args.targets?.split(',') ?? (quick ? ['original', 'base', 'head', 'fastify'] : [...KEYS])
const targets = ALL.filter((t, i) => pick.includes(KEYS[i] ?? ''))
const scenarios = SCENARIOS.filter((s) => args.scenarios === undefined || args.scenarios.split(',').includes(s))

function prepareBase (): void {
  if (!targets.some((t) => t.dir === baseDir)) return
  if (!existsSync(baseDir)) {
    mkdirSync(path.dirname(baseDir), { recursive: true })
    git('worktree', 'add', '--detach', baseDir, args.against)
  }
  // the base needs its dev dependencies to build src/ into lib/
  execFileSync('npm', ['install', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund'], { cwd: baseDir, stdio: 'ignore' })
  execFileSync('npm', ['run', 'build', '--if-present'], { cwd: baseDir, stdio: 'ignore' })
}

function cleanupBase (): void {
  if (args['keep-base'] || !existsSync(baseDir)) return
  git('worktree', 'remove', '--force', baseDir)
}

function startServer (target: Target, scenario: Scenario): Promise<ChildProcess> {
  const child = path.join(here, 'child.ts')
  const argv = [child, target.framework, scenario, String(PORT), ...(target.dir === undefined ? [] : [target.dir])]
  const node = [process.execPath, '--max-old-space-size=256', ...argv]
  const proc = hasTaskset
    ? spawn('taskset', ['-c', layout?.server ?? '0', ...node], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
    : spawn(node[0] ?? process.execPath, node.slice(1), { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { proc.kill(); reject(new Error('server did not start')) }, 15000)
    proc.once('message', () => { clearTimeout(timer); resolve(proc) })
    proc.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited with ${String(code)}`)) })
  })
}

function stopServer (proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (proc.exitCode !== null) return resolve()
    proc.once('exit', () => resolve())
    proc.kill()
  })
}

// Make sure every framework does the same work before measuring it.
async function check (scenario: Scenario): Promise<string | undefined> {
  const c = CHECKS[scenario]
  const res = await fetch(`http://127.0.0.1:${PORT}${c.path}`, {
    method: c.method,
    ...(c.body === undefined ? {} : { body: c.body, headers: { 'content-type': 'application/json' } })
  })
  const text = await res.text()
  if (res.status !== c.status) return `status ${res.status}, expected ${c.status}`
  if (c.text !== undefined && text !== c.text) return `body ${JSON.stringify(text)}, expected ${JSON.stringify(c.text)}`
  if (c.json !== undefined && JSON.stringify(JSON.parse(text)) !== JSON.stringify(c.json)) return `json ${text}`
  return undefined
}

async function load (scenario: Scenario, seconds: number): Promise<Sample> {
  const c = CHECKS[scenario]
  const result = await autocannon({
    url: `http://127.0.0.1:${PORT}${c.path}`,
    method: c.method,
    ...(c.body === undefined ? {} : { body: c.body, headers: { 'content-type': 'application/json' } }),
    connections,
    duration: seconds,
    workers: 2
  })
  const expected = c.status === 404 ? result.non2xx : result['2xx']
  return {
    rps: result.requests.average,
    p50: result.latency.p50,
    p99: result.latency.p99,
    errors: result.errors + result.timeouts,
    unexpected: result.requests.total - expected
  }
}

function median (xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] ?? 0
}

function pct (a: number, b: number): string {
  if (b === 0) return ''
  const d = (a / b - 1) * 100
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`
}

async function main (): Promise<void> {
  if (hasTaskset) execFileSync('taskset', ['-cp', layout?.load ?? '0', String(process.pid)], { stdio: 'ignore' })
  const perRun = warmup + duration + 1
  const total = targets.length * scenarios.length * rounds * perRun
  console.error(`${targets.length} targets x ${scenarios.length} scenarios x ${rounds} rounds, about ${Math.ceil(total / 60)} min. Keep the machine idle.`)
  const load1 = os.loadavg()[0] ?? 0
  // the head runs from lib/, built from src/
  execFileSync('npm', ['run', 'build', '--if-present'], { cwd: repo, stdio: 'ignore' })
  prepareBase()
  const samples = new Map<string, Sample[]>()
  const failed = new Map<string, string>()
  try {
    for (let round = 0; round < rounds; round++) {
      for (const scenario of scenarios) {
        // rotate the order each round so no target always runs first
        const order = targets.map((_, i) => targets[(i + round) % targets.length]).filter((t): t is Target => t !== undefined)
        for (const target of order) {
          const key = `${scenario}|${target.name}`
          if (failed.has(key)) continue
          const proc = await startServer(target, scenario)
          try {
            const problem = await check(scenario)
            if (problem !== undefined) { failed.set(key, problem); console.error(`check failed: ${target.name} ${scenario}: ${problem}`); continue }
            await load(scenario, warmup)
            const s = await load(scenario, duration)
            if (s.errors > 0 || s.unexpected > 0) console.error(`warning: ${target.name} ${scenario}: ${s.errors} errors, ${s.unexpected} unexpected statuses`)
            samples.set(key, [...(samples.get(key) ?? []), s])
            console.error(`round ${round + 1}/${rounds} ${scenario} ${target.name}: ${Math.round(s.rps)} req/s, p99 ${s.p99} ms`)
          } finally {
            await stopServer(proc)
          }
        }
      }
    }
  } finally {
    cleanupBase()
  }

  const rows: Row[] = []
  for (const scenario of scenarios) {
    for (const target of targets) {
      const key = `${scenario}|${target.name}`
      const list = samples.get(key) ?? []
      const fail = failed.get(key)
      rows.push({
        scenario,
        target: target.name,
        rps: Math.round(median(list.map((s) => s.rps))),
        p50: median(list.map((s) => s.p50)),
        p99: median(list.map((s) => s.p99)),
        runs: list.map((s) => Math.round(s.rps)),
        ...(fail === undefined ? {} : { failed: fail })
      })
    }
  }

  const cpu = os.cpus()[0]?.model ?? 'unknown CPU'
  const meta = {
    date: new Date().toISOString(),
    node: process.version,
    cpu,
    cpus: os.cpus().length,
    loadAverageAtStart: Number(load1.toFixed(2)),
    pinned: hasTaskset ? layout : null,
    base: `${args.against} ${baseSha}`,
    head: `${branch} ${headSha}${dirty ? ' (uncommitted changes)' : ''}`,
    rounds,
    durationSeconds: duration,
    warmupSeconds: warmup,
    connections,
    frameworkVersions: frameworkVersions()
  }

  const name = (args.name ?? branch).replace(/[^A-Za-z0-9._-]+/g, '-')
  const outDir = path.join(repo, 'benchmarks', 'results')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify({ meta, rows }, null, 2) + '\n')
  writeFileSync(path.join(outDir, `${name}.md`), markdown(meta, rows))
  console.error(`wrote benchmarks/results/${name}.md and .json`)
}

function frameworkVersions (): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pkg of ['express-original', 'fastify', 'koa', '@koa/router', '@koa/bodyparser', 'hono', '@hono/node-server', 'polka', 'autocannon']) {
    const file = path.join(here, 'node_modules', pkg, 'package.json')
    if (existsSync(file)) {
      const json: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (typeof json === 'object' && json !== null && 'version' in json && typeof json.version === 'string') out[pkg] = json.version
    }
  }
  return out
}

function markdown (meta: Record<string, unknown>, rows: Row[]): string {
  const lines: string[] = []
  lines.push(`# Benchmark: ${String(meta.head)}`, '')
  lines.push(`${String(meta.date).slice(0, 10)} · Node ${String(meta.node)} · ${String(meta.cpu)} · load average ${String(meta.loadAverageAtStart)} at start`, '')
  lines.push(`Median of ${rounds} rounds of ${duration} s (after a ${warmup} s warm-up), ${connections} connections, requests per second. Base: ${String(meta.base)}.`, '')
  const original = new Map(rows.filter((r) => r.target.startsWith('express 5.3.0')).map((r) => [r.scenario, r.rps]))
  const base = new Map(rows.filter((r) => r.target.startsWith('base ')).map((r) => [r.scenario, r.rps]))
  lines.push('## Head compared with the original Express and the base', '')
  lines.push('| Scenario | Head req/s | vs Express 5.3.0 | vs base |', '|---|---|---|---|')
  for (const r of rows.filter((x) => x.target.startsWith('head '))) {
    lines.push(`| ${r.scenario} | ${r.failed ?? r.rps.toLocaleString('en-US')} | ${pct(r.rps, original.get(r.scenario) ?? 0)} | ${pct(r.rps, base.get(r.scenario) ?? 0)} |`)
  }
  lines.push('', '## Every target', '')
  lines.push('| Scenario | Target | req/s | p50 ms | p99 ms | vs Express 5.3.0 | Runs |', '|---|---|---|---|---|---|---|')
  for (const r of rows) {
    const value = r.failed === undefined ? r.rps.toLocaleString('en-US') : `check failed: ${r.failed}`
    lines.push(`| ${r.scenario} | ${r.target} | ${value} | ${r.p50} | ${r.p99} | ${pct(r.rps, original.get(r.scenario) ?? 0)} | ${r.runs.join(', ')} |`)
  }
  lines.push('', 'Framework versions: ' + Object.entries(meta.frameworkVersions as Record<string, string>).map(([k, v]) => `${k} ${v}`).join(', ') + '.', '')
  return lines.join('\n')
}

await main()

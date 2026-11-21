// Starts one server (framework + scenario) and tells the parent when it is
// listening. Usage: node child.ts <framework> <scenario> <port> [express dir]

import { FRAMEWORKS, SCENARIOS } from './servers.ts'
import type { Framework, Scenario } from './servers.ts'

const [framework, scenario, port, dir] = process.argv.slice(2)

function isFramework (name: string | undefined): name is Framework {
  return name !== undefined && Object.hasOwn(FRAMEWORKS, name)
}

function isScenario (name: string | undefined): name is Scenario {
  return name !== undefined && (SCENARIOS as readonly string[]).includes(name)
}

if (!isFramework(framework) || !isScenario(scenario) || port === undefined) {
  console.error('usage: node child.ts <framework> <scenario> <port> [express dir]')
  process.exit(2)
}

await FRAMEWORKS[framework](scenario, Number(port), dir)
if (process.send) process.send('ready')
else console.log('ready')

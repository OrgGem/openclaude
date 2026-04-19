import { readFileSync } from 'fs'
import readline from 'readline'
import { OpenClaudeSdk } from '../src/sdk/OpenClaudeSdk.js'
import type { OpenClaudeSdkRequest } from '../src/sdk/contracts.js'

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  return process.argv[index + 1]
}

function usage(): never {
  process.stderr.write(
    'Usage: bun run scripts/sdk-cli.ts --request <request.json>\n',
  )
  process.exit(1)
}

async function askPermission(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  const answer = await new Promise<string>(resolve => {
    rl.question(`${question} (y/n): `, resolve)
  })
  rl.close()
  return ['y', 'yes'].includes(answer.trim().toLowerCase())
}

async function main() {
  const requestFile = getArg('--request')
  if (!requestFile) usage()

  const requestRaw = readFileSync(requestFile, 'utf-8')
  const request = JSON.parse(requestRaw) as OpenClaudeSdkRequest

  if (request.permission?.mode === 'interactive' && !request.permission.onRequest) {
    request.permission.onRequest = async req =>
      askPermission(
        `Approve ${req.toolName} with input ${JSON.stringify(req.toolInput)}`,
      )
  }

  const sdk = new OpenClaudeSdk()
  const result = await sdk.run(request)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

void main()

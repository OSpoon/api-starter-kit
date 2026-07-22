import { spawn, spawnSync } from 'node:child_process'

const serviceName = 'postgres'
const dockerReadyTimeoutMs = 60_000
const retryIntervalMs = 1_000

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.quiet ? 'pipe' : 'inherit',
  })
}

function isDockerReady() {
  return run('docker', ['info'], { quiet: true }).status === 0
}

function wait(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration))
}

function startDockerDesktop() {
  if (process.platform === 'darwin') {
    const dockerDesktop = spawn('open', ['-a', 'Docker'], { detached: true, stdio: 'ignore' })
    dockerDesktop.unref()
    return true
  }

  if (process.platform === 'win32') {
    const dockerDesktop = spawn('cmd', ['/c', 'start', '', 'Docker Desktop'], {
      detached: true,
      stdio: 'ignore',
    })
    dockerDesktop.unref()
    return true
  }

  return false
}

async function ensureDockerReady() {
  if (isDockerReady()) return

  console.log('Docker daemon is not ready; attempting to start Docker Desktop...')
  const dockerDesktopStarted = startDockerDesktop()

  if (!dockerDesktopStarted) {
    throw new Error('Docker daemon is unavailable. Start Docker and run pnpm dev again.')
  }

  const deadline = Date.now() + dockerReadyTimeoutMs
  while (Date.now() < deadline) {
    await wait(retryIntervalMs)
    if (isDockerReady()) return
  }

  throw new Error('Docker Desktop did not become ready within 60 seconds.')
}

async function main() {
  await ensureDockerReady()

  console.log('Ensuring the PostgreSQL container is healthy...')
  const result = run('docker', [
    'compose',
    'up',
    '-d',
    '--wait',
    '--wait-timeout',
    '60',
    serviceName,
  ])
  if (result.status !== 0) {
    throw new Error('Unable to start a healthy PostgreSQL container.')
  }
}

main().catch((error) => {
  console.error(`Development environment setup failed: ${error.message}`)
  process.exitCode = 1
})

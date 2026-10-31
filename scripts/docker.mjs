import { spawn, spawnSync } from 'node:child_process'
import { cancel, intro, isCancel, multiselect, outro } from '@clack/prompts'

const dockerReadyTimeoutMs = 60_000
const retryIntervalMs = 1_000

const serviceGroups = {
  postgres: {
    label: 'PostgreSQL（本地开发数据库）',
    hint: '默认选择',
    files: ['docker/docker-compose.yml'],
    envFiles: ['apps/backend/.env'],
    services: ['postgres'],
  },
  app: {
    label: '应用（backend、frontend）',
    hint: '会自动启动 PostgreSQL',
    files: ['docker/docker-compose.yml', 'docker/docker-compose.app.yml'],
    envFiles: ['apps/backend/.env'],
    services: ['backend', 'frontend'],
  },
  assistantWeb: {
    label: '独立助手 Web（assistant-web）',
    hint: '会自动启动 backend 和 PostgreSQL',
    files: [
      'docker/docker-compose.yml',
      'docker/docker-compose.app.yml',
      'docker/docker-compose.assistant-web.yml',
    ],
    envFiles: ['apps/backend/.env'],
    services: ['assistant-web'],
  },
  im: {
    label: 'IM 渠道 Bot（企业微信、飞书、钉钉）',
    hint: '会自动启动 backend 和 PostgreSQL',
    files: [
      'docker/docker-compose.yml',
      'docker/docker-compose.app.yml',
      'docker/docker-compose.im.yml',
    ],
    envFiles: ['apps/backend/.env'],
    services: ['wecom-bot', 'feishu-bot', 'dingtalk-bot'],
  },
  monitoring: {
    label: '监控（Prometheus、Grafana、cAdvisor）',
    hint: '独立启动，需要配置 Grafana 密码',
    files: ['docker/docker-compose.monitoring.yml'],
    envFiles: ['docker/monitoring/.env'],
    services: ['prometheus', 'grafana', 'cadvisor'],
  },
}

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

  console.log('Docker daemon 尚未就绪，正在尝试启动 Docker Desktop…')
  const dockerDesktopStarted = startDockerDesktop()

  if (!dockerDesktopStarted) {
    throw new Error('Docker daemon 不可用，请先启动 Docker 后重试。')
  }

  const deadline = Date.now() + dockerReadyTimeoutMs
  while (Date.now() < deadline) {
    await wait(retryIntervalMs)
    if (isDockerReady()) return
  }

  throw new Error('等待 Docker Desktop 启动超时（60 秒）。')
}

function createComposeArgs(selectedGroups) {
  const files = new Set()
  const envFiles = new Set()
  const services = []

  for (const key of selectedGroups) {
    const group = serviceGroups[key]
    for (const file of group.files) files.add(file)
    for (const envFile of group.envFiles) envFiles.add(envFile)
    services.push(...group.services)
  }

  const args = ['compose', '-p', 'api-starter-kit']
  for (const envFile of envFiles) args.push('--env-file', envFile)
  for (const file of files) args.push('-f', file)
  args.push('up', '-d', '--build', '--wait', '--wait-timeout', '60', ...services)
  return args
}

async function main() {
  intro('Docker Compose')

  const selection = await multiselect({
    message: '选择要启动的服务组（可多选）',
    initialValues: ['postgres'],
    options: Object.entries(serviceGroups).map(([value, group]) => ({
      value,
      label: group.label,
      hint: group.hint,
    })),
    required: true,
  })

  if (isCancel(selection)) {
    cancel('已取消启动。')
    return
  }

  await ensureDockerReady()

  const result = run('docker', createComposeArgs(selection))
  if (result.status !== 0) {
    throw new Error('Compose 启动失败，请检查上方错误信息。')
  }

  outro('所选服务已启动。')
}

main().catch((error) => {
  console.error(`启动失败：${error.message}`)
  process.exitCode = 1
})

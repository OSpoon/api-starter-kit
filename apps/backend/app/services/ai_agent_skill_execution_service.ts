import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, lstat, mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import app from '@adonisjs/core/services/app'
import { SandboxManager } from '@anthropic-ai/sandbox-runtime'

import env from '#start/env'

const maxOutputBytes = 64 * 1024
const timeoutMs = 30_000
const maxContextBytes = 64 * 1024
const maxSkillFiles = 256
const maxSkillSourceBytes = 5 * 1024 * 1024
const maxSkillFileBytes = 1024 * 1024
const supportedScriptExtensions = new Set(['.js', '.mjs', '.cjs', '.py', '.sh', '.bash'])
const runnerPath = '/opt/homebrew/bin:/opt/local/bin:/usr/local/bin:/usr/bin:/bin'
const seccompHelperPath =
  process.platform === 'linux' && (process.arch === 'x64' || process.arch === 'arm64')
    ? fileURLToPath(
        new URL(
          `../vendor/seccomp/${process.arch}/apply-seccomp`,
          import.meta.resolve('@anthropic-ai/sandbox-runtime')
        )
      )
    : undefined
let sandboxInitialization: Promise<void> | undefined

function getSandboxInitialization() {
  sandboxInitialization ??= SandboxManager.initialize({
    network: { allowedDomains: [], deniedDomains: [], strictAllowlist: true },
    filesystem: { denyRead: [], allowWrite: [], denyWrite: [] },
    enableWeakerNestedSandbox: false,
  }).catch((error: unknown) => {
    sandboxInitialization = undefined
    throw error
  })
  return sandboxInitialization
}

export async function resetAiAgentSkillSandbox() {
  try {
    await SandboxManager.reset()
  } finally {
    sandboxInitialization = undefined
  }
}

function quoteShellArgument(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function getSkillsRoot() {
  const workspace = resolve(env.get('AI_AGENT_SKILLS_DIR') ?? app.makePath('storage'))
  return join(workspace, '.agents', 'skills')
}

async function validateSkillSources(skillDirectory: string) {
  const pending = [skillDirectory]
  const scripts: string[] = []
  let fileCount = 0
  let totalBytes = 0

  while (pending.length) {
    const directory = pending.pop()!
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error('技能目录不能包含符号链接')
      if (entry.isDirectory()) {
        pending.push(path)
        continue
      }
      if (!entry.isFile() || !supportedScriptExtensions.has(extname(entry.name).toLowerCase())) {
        continue
      }

      const fileStat = await lstat(path)
      if (++fileCount > maxSkillFiles || fileStat.size > maxSkillFileBytes) {
        throw new Error('技能脚本数量或大小超过执行限制')
      }
      totalBytes += fileStat.size
      if (totalBytes > maxSkillSourceBytes) throw new Error('技能脚本总大小超过执行限制')
      scripts.push(relative(skillDirectory, path).split(sep).join('/'))
    }
  }

  return scripts.sort()
}

export async function getAiAgentSkillScriptPaths(skillDirectory: string) {
  return validateSkillSources(await realpath(skillDirectory))
}

async function getPythonPath() {
  for (const directory of runnerPath.split(':')) {
    const path = join(directory, 'python3')
    try {
      await access(path, constants.X_OK)
      const resolvedPath = await realpath(path)
      const home = resolve(process.env.HOME ?? '/home/node')
      if (resolvedPath !== home && !resolvedPath.startsWith(`${home}${sep}`)) return resolvedPath
    } catch {
      continue
    }
  }
  throw new Error('未找到可用的 Python 3 解释器')
}

function createBoundedOutput() {
  const chunks: Buffer[] = []
  let size = 0
  return {
    append(chunk: Buffer) {
      const remaining = maxOutputBytes - size
      if (remaining <= 0) return
      const boundedChunk = chunk.subarray(0, remaining)
      chunks.push(boundedChunk)
      size += boundedChunk.length
    },
    toString() {
      return Buffer.concat(chunks).toString('utf8')
    },
  }
}

function runSandboxProcess(input: {
  argv: string[]
  skillDirectory: string
  temporaryDirectory: string
  contextJson: string
  signal?: AbortSignal
}) {
  return new Promise<{
    exitCode: number | null
    timedOut: boolean
    stdout: string
    stderr: string
  }>((resolveResult, reject) => {
    const child = spawn(input.argv[0]!, input.argv.slice(1), {
      cwd: input.skillDirectory,
      detached: true,
      env: {
        PATH: runnerPath,
        LANG: 'C.UTF-8',
        HOME: input.temporaryDirectory,
        TMPDIR: input.temporaryDirectory,
        ASSISTANT_SKILL_CONTEXT_JSON: input.contextJson,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout = createBoundedOutput()
    const stderr = createBoundedOutput()
    let timedOut = false
    let errorMessage = ''
    let timeout: NodeJS.Timeout | undefined

    const signalProcessGroup = (signal: NodeJS.Signals) => {
      // shortcut: process groups miss scripts that deliberately start a new session; use cgroups if that threat becomes in scope.
      if (child.pid === undefined) return
      try {
        process.kill(-child.pid, signal)
      } catch {
        // The process group may already have exited.
      }
    }
    const terminateProcessGroup = () => {
      signalProcessGroup('SIGTERM')
      const forceKill = setTimeout(() => signalProcessGroup('SIGKILL'), 500)
      forceKill.unref()
    }
    const abort = () => terminateProcessGroup()

    child.stdout.on('data', (chunk: Buffer) => stdout.append(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.append(chunk))
    child.on('error', (error) => {
      errorMessage = error.message
    })
    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout)
      input.signal?.removeEventListener('abort', abort)
      terminateProcessGroup()
      if (input.signal?.aborted) {
        reject(new DOMException('AI request was cancelled', 'AbortError'))
        return
      }
      resolveResult({
        exitCode: code,
        timedOut,
        stdout: stdout.toString(),
        stderr: stderr.toString() || errorMessage,
      })
    })

    input.signal?.addEventListener('abort', abort, { once: true })
    timeout = setTimeout(() => {
      timedOut = true
      terminateProcessGroup()
    }, timeoutMs)
  })
}

export async function executeAiAgentSkillScript(input: {
  skillDirectory: string
  scriptPath: string
  runtime: 'node' | 'python' | 'bash'
  args: string[]
  context: object
  signal?: AbortSignal
}) {
  const contextJson = JSON.stringify(input.context)
  if (Buffer.byteLength(contextJson) > maxContextBytes) {
    throw new Error('技能运行时上下文过大')
  }
  if (input.signal?.aborted) throw new DOMException('AI request was cancelled', 'AbortError')

  const skillDirectory = await resolve(input.skillDirectory)
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'ai-agent-skill-'))
  try {
    await validateSkillSources(skillDirectory)
    await getSandboxInitialization()
    const appDirectory = resolve(process.cwd())
    const executable =
      input.runtime === 'node'
        ? process.execPath
        : input.runtime === 'python'
          ? await getPythonPath()
          : '/bin/bash'
    const scriptPath = join(skillDirectory, input.scriptPath)
    const runtimeArgs =
      input.runtime === 'node'
        ? [
            '--permission',
            '--max-old-space-size=256',
            `--allow-fs-read=${skillDirectory},${temporaryDirectory}`,
            `--allow-fs-write=${temporaryDirectory}`,
            scriptPath,
            ...input.args,
          ]
        : input.runtime === 'python'
          ? ['-I', '-B', scriptPath, ...input.args]
          : ['--noprofile', '--norc', scriptPath, ...input.args]
    const command = [
      `TMPDIR=${quoteShellArgument(temporaryDirectory)}`,
      'exec',
      quoteShellArgument(executable),
      ...runtimeArgs.map(quoteShellArgument),
    ].join(' ')
    const wrapped = await SandboxManager.wrapWithSandboxArgv(
      command,
      '/bin/bash',
      {
        filesystem: {
          denyRead: [appDirectory, getSkillsRoot(), resolve(process.env.HOME ?? '/home/node')],
          allowRead: [
            skillDirectory,
            executable,
            ...(seccompHelperPath ? [seccompHelperPath] : []),
          ],
          allowWrite: [temporaryDirectory],
          denyWrite: [appDirectory, getSkillsRoot(), '/tmp/claude'],
        },
      },
      input.signal,
      skillDirectory
    )

    try {
      return await runSandboxProcess({
        argv: wrapped.argv,
        skillDirectory,
        temporaryDirectory,
        contextJson,
        signal: input.signal,
      })
    } finally {
      SandboxManager.cleanupAfterCommand()
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

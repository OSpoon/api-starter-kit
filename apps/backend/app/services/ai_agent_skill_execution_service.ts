import { execFile as nodeExecFile } from 'node:child_process'
import { lstat, mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

import app from '@adonisjs/core/services/app'
import { SandboxManager } from '@anthropic-ai/sandbox-runtime'

import env from '#start/env'

const execFile = promisify(nodeExecFile)
const maxOutputBytes = 64 * 1024
const timeoutMs = 30_000
const maxContextBytes = 64 * 1024
const maxSkillFiles = 256
const maxSkillSourceBytes = 5 * 1024 * 1024
const maxSkillFileBytes = 1024 * 1024
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
      if (!entry.isFile() || !['.js', '.mjs', '.cjs'].includes(extname(entry.name).toLowerCase())) {
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

export async function executeAiAgentSkillScript(input: {
  skillDirectory: string
  scriptPath: string
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
    const command = [
      `TMPDIR=${quoteShellArgument(temporaryDirectory)}`,
      'exec',
      quoteShellArgument(process.execPath),
      quoteShellArgument('--permission'),
      quoteShellArgument('--max-old-space-size=256'),
      quoteShellArgument(`--allow-fs-read=${skillDirectory},${temporaryDirectory}`),
      quoteShellArgument(`--allow-fs-write=${temporaryDirectory}`),
      quoteShellArgument(join(skillDirectory, input.scriptPath)),
      ...input.args.map(quoteShellArgument),
    ].join(' ')
    const wrapped = await SandboxManager.wrapWithSandboxArgv(
      command,
      '/bin/bash',
      {
        filesystem: {
          denyRead: [appDirectory, getSkillsRoot(), resolve(process.env.HOME ?? '/home/node')],
          allowRead: [skillDirectory, process.execPath],
          allowWrite: [temporaryDirectory],
          denyWrite: [appDirectory, getSkillsRoot(), '/tmp/claude'],
        },
      },
      input.signal,
      skillDirectory
    )

    try {
      const { stdout, stderr } = await execFile(wrapped.argv[0]!, wrapped.argv.slice(1), {
        cwd: skillDirectory,
        env: {
          PATH: '/usr/local/bin:/usr/bin:/bin',
          LANG: 'C.UTF-8',
          HOME: temporaryDirectory,
          TMPDIR: temporaryDirectory,
          ASSISTANT_SKILL_CONTEXT_JSON: contextJson,
        },
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: maxOutputBytes * 2,
        signal: input.signal,
      })
      return {
        exitCode: 0,
        timedOut: false,
        stdout: stdout.slice(0, maxOutputBytes),
        stderr: stderr.slice(0, maxOutputBytes),
      }
    } catch (error) {
      if (input.signal?.aborted) throw new DOMException('AI request was cancelled', 'AbortError')
      const result = error as NodeJS.ErrnoException & { stdout?: unknown; stderr?: unknown }
      return {
        exitCode: typeof result.code === 'number' ? result.code : null,
        timedOut: result.code === 'ETIMEDOUT',
        stdout: typeof result.stdout === 'string' ? result.stdout.slice(0, maxOutputBytes) : '',
        stderr: typeof result.stderr === 'string' ? result.stderr.slice(0, maxOutputBytes) : '',
      }
    } finally {
      SandboxManager.cleanupAfterCommand()
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

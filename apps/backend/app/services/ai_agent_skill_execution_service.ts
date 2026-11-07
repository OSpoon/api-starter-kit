import { execFile as nodeExecFile } from 'node:child_process'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import { extname, relative, sep } from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(nodeExecFile)
const maxSkillFiles = 256
const maxSkillSourceBytes = 5 * 1024 * 1024
const maxSkillFileBytes = 1024 * 1024
const maxOutputBytes = 64 * 1024
const timeoutMs = 30_000

const blockedPatterns = [
  /\b(?:from\s*|import\s*|require\s*\(\s*)['"](?:node:)?(?:child_process|worker_threads|cluster|http2?|https|net|tls|dgram|dns|inspector|vm|sqlite|ffi|wasi|undici)(?:\/[^'"]*)?['"]/i,
  /\b(?:fetch|WebSocket|WebSocketStream|WebTransport|EventSource|XMLHttpRequest)\b/,
  /\b(?:eval|Function)\s*\(/,
  /\bimport\s*\(/,
  /\bprocess\s*\.\s*(?:binding|_linkedBinding|_debugProcess|kill|dlopen|getBuiltinModule|abort|setuid|setgid|setgroups|report)\b/,
  /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|writeReport|unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|mkdir|mkdirSync|rename|renameSync|chmod|chmodSync|chown|chownSync|truncate|truncateSync|copyFile|copyFileSync|symlink|symlinkSync|link|linkSync)\s*\(/,
]

// shortcut: static checks miss obfuscated API access, use this executor only for trusted skills.

function ensureWithinSkill(root: string, candidate: string) {
  const path = relative(root, candidate)
  if (!path || path === '..' || path.startsWith(`..${sep}`)) {
    throw new Error('技能脚本路径无效')
  }
}

export function findBlockedSkillApi(source: string) {
  return blockedPatterns.find((pattern) => pattern.test(source))?.source
}

async function validateSkillSources(skillDirectory: string) {
  const root = await realpath(skillDirectory)
  const pending = [root]
  let fileCount = 0
  let totalBytes = 0

  while (pending.length) {
    const directory = pending.pop()!
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = `${directory}${sep}${entry.name}`
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
      const file = await open(path, 'r')
      try {
        const openedFileStat = await file.stat()
        if (!openedFileStat.isFile()) throw new Error('技能脚本无效')
        const source = await file.readFile('utf8')
        if (findBlockedSkillApi(source)) {
          throw new Error(`技能脚本包含禁止的高危 API：${relative(root, path)}`)
        }
      } finally {
        await file.close()
      }
    }
  }
}

export async function executeAiAgentSkillScript(input: {
  skillDirectory: string
  scriptPath: string
  args: string[]
  context: object
  signal?: AbortSignal
}) {
  const root = await realpath(input.skillDirectory)
  const script = await realpath(input.scriptPath)
  ensureWithinSkill(root, script)
  await validateSkillSources(root)
  if (input.signal?.aborted) throw new DOMException('AI request was cancelled', 'AbortError')

  try {
    const { stdout, stderr } = await execFile(
      process.execPath,
      [
        '--permission',
        '--max-old-space-size=256',
        `--allow-fs-read=${root}`,
        script,
        ...input.args,
      ],
      {
        cwd: root,
        env: {
          PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin',
          LANG: 'C.UTF-8',
          ASSISTANT_SKILL_CONTEXT_JSON: JSON.stringify(input.context),
        },
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: maxOutputBytes * 2,
        signal: input.signal,
      }
    )
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
  }
}

import { execFile as nodeExecFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

import app from '@adonisjs/core/services/app'
import { parse } from 'yaml'

import type {
  AiAgentSkillCapability,
  AiAgentSkillRuntimeContext,
} from '#services/ai_agent_skill_context_service'
import { executeAiAgentSkillScript } from '#services/ai_agent_skill_execution_service'
import env from '#start/env'

const execFile = promisify(nodeExecFile)
const skillFileLimit = 128 * 1024
const skillScriptLimit = 1024 * 1024
const supportedSkillCapabilities = new Set<AiAgentSkillCapability>(['system-status'])

export type AiAgentSkill = {
  code: string
  name: string
  description: string
  enabled: boolean
  updatedAt: string
}

export class AiAgentSkillNotFoundError extends Error {
  code = 'E_ROW_NOT_FOUND'
  status = 404

  constructor() {
    super('技能不存在')
    this.name = 'AiAgentSkillNotFoundError'
  }
}

function getSkillsWorkspace(workspace = env.get('AI_AGENT_SKILLS_DIR') ?? app.makePath('storage')) {
  return resolve(workspace)
}

function getSkillsDirectory(workspace: string) {
  return join(workspace, '.agents', 'skills')
}

function getStatePath(workspace: string) {
  return join(workspace, '.assistant-skills.json')
}

async function readState(workspace: string): Promise<Record<string, boolean>> {
  try {
    const value: unknown = JSON.parse(await readFile(getStatePath(workspace), 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === 'boolean'
      )
    )
  } catch {
    return {}
  }
}

async function writeState(workspace: string, state: Record<string, boolean>) {
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  const path = getStatePath(workspace)
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, JSON.stringify(state), { mode: 0o600 })
    await rename(temporaryPath, path)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

async function readFileHead(path: string, maxBytes = skillFileLimit) {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(maxBytes)
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

function parseSkillFrontmatter(content: string) {
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  if (!match) return {}
  try {
    const parsed: unknown = parse(match[1]!)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function parseSkillMetadata(content: string, fallbackName: string) {
  const metadata = parseSkillFrontmatter(content)
  return {
    name:
      typeof metadata.name === 'string' && metadata.name.trim()
        ? metadata.name.trim()
        : fallbackName,
    description:
      typeof metadata.description === 'string' && metadata.description.trim()
        ? metadata.description.trim().slice(0, 2000)
        : fallbackName,
  }
}

function getSkillCapabilities(content: string) {
  const declared = parseSkillFrontmatter(content)['assistant-capabilities']
  if (declared === undefined) return []
  if (
    !Array.isArray(declared) ||
    declared.some((capability) => {
      if (typeof capability !== 'string') return true
      return !supportedSkillCapabilities.has(capability as AiAgentSkillCapability)
    })
  ) {
    throw new Error('技能声明了不支持的运行时能力')
  }
  return [...new Set(declared)] as AiAgentSkillCapability[]
}

async function listSkillDirectories(workspace: string) {
  const skillsDirectory = getSkillsDirectory(workspace)
  let entries
  try {
    entries = await readdir(skillsDirectory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const result: Array<{ code: string; path: string; content: string; updatedAt: Date }> = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const path = join(skillsDirectory, entry.name)
    const skillFilePath = join(path, 'SKILL.md')
    try {
      const fileStat = await lstat(skillFilePath)
      if (!fileStat.isFile()) continue
      result.push({
        code: entry.name,
        path,
        content: await readFileHead(skillFilePath),
        updatedAt: fileStat.mtime,
      })
    } catch {
      continue
    }
  }
  return result.sort((left, right) => left.code.localeCompare(right.code))
}

async function listSkillsFromWorkspace(workspace: string) {
  const [directories, state] = await Promise.all([
    listSkillDirectories(workspace),
    readState(workspace),
  ])
  return directories.map(({ code, path: _path, content, updatedAt }) => ({
    code,
    ...parseSkillMetadata(content, code),
    enabled: state[code] ?? false,
    updatedAt: updatedAt.toISOString(),
  })) satisfies AiAgentSkill[]
}

export async function listAiAgentSkills(page = 1, limit = 20, workspace?: string) {
  const root = getSkillsWorkspace(workspace)
  const items = await listSkillsFromWorkspace(root)
  const lastPage = Math.max(1, Math.ceil(items.length / limit))
  const currentPage = Math.min(page, lastPage)
  const offset = (currentPage - 1) * limit
  return {
    items: items.slice(offset, offset + limit),
    meta: { currentPage, perPage: limit, lastPage, total: items.length },
  }
}

export async function listEnabledAiAgentSkills(workspace?: string) {
  const skills = await listSkillsFromWorkspace(getSkillsWorkspace(workspace))
  return skills.filter((skill) => skill.enabled)
}

function validateSkillCode(code: string) {
  if (!code.trim() || code.length > 128 || code === '.' || code === '..' || /[\\/\0]/.test(code)) {
    throw new Error('技能名称无效')
  }
  return code
}

async function getEnabledSkillDirectory(code: string, workspace?: string) {
  validateSkillCode(code)
  const root = getSkillsWorkspace(workspace)
  const skills = await listSkillsFromWorkspace(root)
  if (!skills.some((skill) => skill.code === code && skill.enabled)) {
    throw new AiAgentSkillNotFoundError()
  }
  return realpath(join(getSkillsDirectory(root), code))
}

async function resolveSkillFile(skillPath: string, resourcePath: string, maxBytes: number) {
  if (
    !resourcePath.trim() ||
    isAbsolute(resourcePath) ||
    resourcePath.includes('\0') ||
    resourcePath.includes('\\') ||
    resourcePath.length > 512
  ) {
    throw new Error('技能资源路径无效')
  }
  const filePath = resolve(skillPath, resourcePath)
  const lexicalPathFromSkill = relative(skillPath, filePath)
  if (lexicalPathFromSkill === '..' || lexicalPathFromSkill.startsWith(`..${sep}`)) {
    throw new Error('技能资源路径无效')
  }
  let realFilePath: string
  try {
    realFilePath = await realpath(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('技能资源不存在')
    }
    throw error
  }
  const pathFromSkill = relative(skillPath, realFilePath)
  if (pathFromSkill === '..' || pathFromSkill.startsWith(`..${sep}`)) {
    throw new Error('技能资源路径无效')
  }
  const fileStat = await lstat(realFilePath)
  if (!fileStat.isFile() || fileStat.size > maxBytes) {
    throw new Error('技能资源不存在或超过大小限制')
  }
  return realFilePath
}

export async function updateAiAgentSkill(code: string, enabled: boolean, workspace?: string) {
  validateSkillCode(code)
  const root = getSkillsWorkspace(workspace)
  const skills = await listSkillsFromWorkspace(root)
  const skill = skills.find((item) => item.code === code)
  if (!skill) throw new AiAgentSkillNotFoundError()
  const state = await readState(root)
  state[code] = enabled
  await writeState(root, state)
  return { ...skill, enabled }
}

async function runSkillsCli(args: string[], workspace: string) {
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  const cliPath = join(process.cwd(), 'node_modules', 'skills', 'bin', 'cli.mjs')
  try {
    return await execFile(process.execPath, [cliPath, ...args], {
      cwd: workspace,
      env: { ...process.env, DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1' },
      timeout: 180_000,
      maxBuffer: 5 * 1024 * 1024,
    })
  } catch {
    throw new Error('skills CLI 执行失败，请检查来源地址、网络连接和仓库权限')
  }
}

export function validateAiAgentSkillSource(source: string) {
  const value = source.trim()
  const shorthand =
    /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*(?:@[A-Za-z0-9._/-]+)?$/
  const gitSsh = /^git@[A-Za-z0-9.-]+:[^\s]+\.git$/i
  if (shorthand.test(value) || gitSsh.test(value)) return value
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('来源必须是 GitHub 仓库地址或以 .git 结尾的 Git 仓库地址')
  }
  const pathSegments = url.pathname.split('/').filter(Boolean)
  const isGithubRepository =
    url.hostname.toLowerCase() === 'github.com' &&
    pathSegments.length >= 2 &&
    pathSegments[2]?.toLowerCase() !== 'archive' &&
    !/\.(?:zip|tar|tgz|gz)$/i.test(url.pathname)
  const isGitRemote = /\.git$/i.test(url.pathname)
  if (
    !['https:', 'ssh:'].includes(url.protocol) ||
    (url.username && !(url.protocol === 'ssh:' && url.username === 'git')) ||
    url.password ||
    url.search ||
    value.includes('\0') ||
    (!isGithubRepository && !isGitRemote)
  ) {
    throw new Error('来源必须是 GitHub 仓库地址或以 .git 结尾的 Git 仓库地址，且不能包含凭据')
  }
  return value
}

export async function installAiAgentSkills(source: string, workspace?: string) {
  const validatedSource = validateAiAgentSkillSource(source)
  const root = getSkillsWorkspace(workspace)
  const before = await listSkillsFromWorkspace(root)
  await runSkillsCli(
    ['add', validatedSource, '--skill', '*', '--agent', 'universal', '--copy', '--yes'],
    root
  )
  const after = await listSkillsFromWorkspace(root)
  const state = await readState(root)
  const installed = after.filter(
    (skill) => !before.some((previous) => previous.code === skill.code)
  )
  for (const skill of installed) state[skill.code] = false
  await writeState(root, state)
  return installed.map(({ code, name }) => ({ code, name }))
}

export async function removeAiAgentSkill(code: string, workspace?: string) {
  validateSkillCode(code)
  const root = getSkillsWorkspace(workspace)
  const skills = await listSkillsFromWorkspace(root)
  const skill = skills.find((item) => item.code === code)
  if (!skill) throw new AiAgentSkillNotFoundError()
  await runSkillsCli(['remove', code, '--yes'], root)
  const remainingSkills = await listSkillsFromWorkspace(root)
  if (remainingSkills.some((item) => item.code === code)) {
    throw new Error('skills CLI 未能移除技能')
  }
  const state = await readState(root)
  delete state[code]
  await writeState(root, state)
  return skill
}

export async function loadAiAgentSkill(
  code: string,
  resourcePath = 'SKILL.md',
  workspace?: string
) {
  const skillPath = await getEnabledSkillDirectory(code, workspace)
  const filePath = await resolveSkillFile(skillPath, resourcePath, skillFileLimit)
  const fileHandle = await open(filePath, 'r')
  try {
    const realPath = await fileHandle.stat()
    if (!realPath.isFile()) throw new Error('技能资源无效')
    return await fileHandle.readFile({ encoding: 'utf8' })
  } finally {
    await fileHandle.close()
  }
}

export async function getAiAgentSkillCapabilities(
  code: string,
  workspace?: string
): Promise<AiAgentSkillCapability[]> {
  const skillPath = await getEnabledSkillDirectory(code, workspace)
  const skillMarkdownPath = await resolveSkillFile(skillPath, 'SKILL.md', skillFileLimit)
  return getSkillCapabilities(await readFile(skillMarkdownPath, 'utf8'))
}

export async function runAiAgentSkillCommand(
  code: string,
  scriptPath: string,
  args: string[],
  workspace?: string,
  signal?: AbortSignal,
  context: AiAgentSkillRuntimeContext = {}
) {
  const skillPath = await getEnabledSkillDirectory(code, workspace)
  const skillMarkdownPath = await resolveSkillFile(skillPath, 'SKILL.md', skillFileLimit)
  const declaredCapabilities = getSkillCapabilities(
    await readFile(skillMarkdownPath, 'utf8')
  ).sort()
  const contextCapabilities = Object.keys(context).sort()
  if (
    declaredCapabilities.length !== contextCapabilities.length ||
    declaredCapabilities.some((capability, index) => capability !== contextCapabilities[index])
  ) {
    throw new Error('技能运行时能力上下文不匹配')
  }
  if (args.length > 32 || args.some((arg) => arg.includes('\0') || Buffer.byteLength(arg) > 4096)) {
    throw new Error('技能脚本参数无效')
  }
  if (args.reduce((total, arg) => total + Buffer.byteLength(arg), 0) > 64 * 1024) {
    throw new Error('技能脚本参数过长')
  }
  const skillRelativeScriptPath = isAbsolute(scriptPath)
    ? relative(skillPath, await realpath(scriptPath))
    : scriptPath
  const resolvedScript = await resolveSkillFile(
    skillPath,
    skillRelativeScriptPath,
    skillScriptLimit
  )
  if (!['.js', '.mjs', '.cjs'].includes(extname(resolvedScript).toLowerCase())) {
    throw new Error('技能脚本必须是 JavaScript 文件')
  }
  if (signal?.aborted) throw new DOMException('AI request was cancelled', 'AbortError')
  const canonicalScriptPath = relative(skillPath, resolvedScript).split(sep).join('/')
  const result = await executeAiAgentSkillScript({
    skillDirectory: skillPath,
    scriptPath: resolvedScript,
    args,
    context,
    signal,
  })
  return { ...result, scriptPath: canonicalScriptPath }
}

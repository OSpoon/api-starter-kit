import AiAgentMcpServer, { type AiAgentMcpToolConfiguration } from '#models/ai_agent_mcp_server'
import AiAgentSkill from '#models/ai_agent_skill'
import {
  type AiAgentMcpProcessConfiguration,
  assertAiAgentMcpConfiguration,
  encryptAiAgentMcpEnvironment,
  serializeAiAgentMcpServer,
} from '#services/ai_agent_mcp_service'

type SkillInput = {
  code: string
  name: string
  description: string
  instructions: string
  enabled: boolean
}

type McpServerInput = AiAgentMcpProcessConfiguration & {
  name: string
  enabled: boolean
  enabledTools: Record<string, AiAgentMcpToolConfiguration>
}

export async function listAiAgentSkills(page: number, limit: number) {
  const paginator = await AiAgentSkill.query()
    .orderBy('updated_at', 'desc')
    .orderBy('id', 'desc')
    .paginate(page, limit)
  return { items: paginator.all(), meta: paginator.getMeta() }
}

export async function createAiAgentSkill(input: SkillInput) {
  return AiAgentSkill.create(input)
}

export async function getAiAgentSkill(id: number) {
  return AiAgentSkill.findOrFail(id)
}

export async function updateAiAgentSkill(id: number, input: Partial<SkillInput>) {
  const skill = await AiAgentSkill.findOrFail(id)
  skill.merge(input)
  await skill.save()
  return skill
}

export async function deleteAiAgentSkill(id: number) {
  const skill = await AiAgentSkill.findOrFail(id)
  await skill.delete()
}

export async function listAiAgentMcpServers(page: number, limit: number) {
  const paginator = await AiAgentMcpServer.query()
    .orderBy('updated_at', 'desc')
    .orderBy('id', 'desc')
    .paginate(page, limit)
  return {
    items: paginator.all().map(serializeAiAgentMcpServer),
    meta: paginator.getMeta(),
  }
}

export async function listEnabledAiAgentMcpServers() {
  const servers: AiAgentMcpServer[] = []
  let page = 1
  while (true) {
    const result = await AiAgentMcpServer.query()
      .where('enabled', true)
      .orderBy('id', 'asc')
      .paginate(page, 100)
    servers.push(...result.all())
    if (page >= result.lastPage) break
    page += 1
  }
  return servers
}

export async function createAiAgentMcpServer(input: McpServerInput) {
  const configuration = assertAiAgentMcpConfiguration(input)
  const server = await AiAgentMcpServer.create({
    name: input.name,
    command: configuration.command,
    args: configuration.args,
    cwd: configuration.cwd ?? null,
    environment: encryptAiAgentMcpEnvironment(configuration.environment),
    enabled: input.enabled,
    enabledTools: input.enabledTools,
  })
  return serializeAiAgentMcpServer(server)
}

export async function updateAiAgentMcpServer(id: number, input: Partial<McpServerInput>) {
  const server = await AiAgentMcpServer.findOrFail(id)
  if (input.name !== undefined) server.name = input.name
  if (input.command !== undefined) server.command = input.command
  if (input.args !== undefined) server.args = input.args
  if (input.cwd !== undefined) server.cwd = input.cwd || null
  if (input.environment !== undefined) {
    server.environment = encryptAiAgentMcpEnvironment(input.environment)
  }
  if (input.enabled !== undefined) server.enabled = input.enabled
  if (input.enabledTools !== undefined) server.enabledTools = input.enabledTools
  if (server.enabled || input.command !== undefined) {
    const configuration = assertAiAgentMcpConfiguration({
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      environment: input.environment ?? undefined,
    })
    server.command = configuration.command
    server.args = configuration.args
    server.cwd = configuration.cwd ?? null
  }
  await server.save()
  return serializeAiAgentMcpServer(server)
}

export async function deleteAiAgentMcpServer(id: number) {
  const server = await AiAgentMcpServer.findOrFail(id)
  await server.delete()
}

export async function getAiAgentMcpServer(id: number) {
  return AiAgentMcpServer.findOrFail(id)
}

import {
  type AiAgentToolMode,
  type BuiltInAiAgentToolName,
  builtInAiAgentToolNames,
  canConfigureAiAgentToolMode,
  defaultAiAgentToolMode,
  requiresAiAgentToolConfirmation,
} from '#ai/core/ai_agent_tool_catalog'
import AiAgentConfiguration from '#models/ai_agent_configuration'

export type AiAgentToolSetting = {
  code: BuiltInAiAgentToolName
  enabled: boolean
  mode: AiAgentToolMode
  modeConfigurable: boolean
  requiresConfirmation: boolean
}

type AiAgentToolSettingInput = Pick<AiAgentToolSetting, 'code' | 'enabled' | 'mode'>

export async function getAiAgentToolSettings(): Promise<AiAgentToolSetting[]> {
  const configuration = await AiAgentConfiguration.find(1)
  const configuredNames = new Set(configuration?.enabledTools ?? builtInAiAgentToolNames)
  const modes = configuration?.toolModes ?? {}
  return builtInAiAgentToolNames.map((code) => ({
    code,
    enabled: configuredNames.has(code),
    mode: canConfigureAiAgentToolMode(code)
      ? (modes[code] ?? defaultAiAgentToolMode(code))
      : defaultAiAgentToolMode(code),
    modeConfigurable: canConfigureAiAgentToolMode(code),
    requiresConfirmation: requiresAiAgentToolConfirmation(code),
  }))
}

export async function getEnabledAiAgentToolNames() {
  const settings = await getAiAgentToolSettings()
  return settings.filter((tool) => tool.enabled).map((tool) => tool.code)
}

export async function updateAiAgentToolSettings(settings: AiAgentToolSettingInput[]) {
  const allowedNames = new Set<string>(builtInAiAgentToolNames)
  const invalidNames = settings
    .filter((tool) => !allowedNames.has(tool.code))
    .map((tool) => tool.code)
  if (invalidNames.length) throw new Error(`未知的 Agent 工具：${invalidNames.join(', ')}`)
  const configured = new Map(settings.map((tool) => [tool.code, tool]))
  if (
    configured.size !== settings.length ||
    builtInAiAgentToolNames.some((name) => name !== 'read_pdf_attachment' && !configured.has(name))
  ) {
    throw new Error('必须为每个内置 Agent 工具提交且仅提交一项配置')
  }
  // Older clients omit the PDF setting. Preserve the administrator's saved value.
  const enabledTools = settings.filter((tool) => tool.enabled).map((tool) => tool.code)
  if (!configured.has('read_pdf_attachment')) {
    const currentEnabledTools = await getEnabledAiAgentToolNames()
    if (currentEnabledTools.includes('read_pdf_attachment'))
      enabledTools.push('read_pdf_attachment')
  }
  const toolModes = Object.fromEntries(
    builtInAiAgentToolNames.map((code) => [
      code,
      canConfigureAiAgentToolMode(code)
        ? (configured.get(code)?.mode ?? defaultAiAgentToolMode(code))
        : defaultAiAgentToolMode(code),
    ])
  ) as Record<BuiltInAiAgentToolName, AiAgentToolMode>
  const configuration = await AiAgentConfiguration.updateOrCreate(
    { id: 1 },
    { enabledTools: [...new Set(enabledTools)], toolModes }
  )
  return configuration
}

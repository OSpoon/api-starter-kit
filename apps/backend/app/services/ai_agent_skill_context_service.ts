import { readSystemStatus } from '#services/system_status_service'

export type AiAgentSkillCapability = 'system-status'
export type AiAgentSkillRuntimeContext = Partial<Record<AiAgentSkillCapability, unknown>>

export async function loadAiAgentSkillRuntimeContext(
  capabilities: AiAgentSkillCapability[]
): Promise<AiAgentSkillRuntimeContext> {
  const context: AiAgentSkillRuntimeContext = {}
  if (capabilities.includes('system-status')) {
    const status = await readSystemStatus()
    context['system-status'] = {
      cpu: status.cpu,
      memory: status.memory,
      disks: status.disks,
      diskCollectionAvailable: status.diskCollectionAvailable,
      runtime: {
        platform: status.runtime.platform,
        osVersion: status.runtime.osVersion,
        nodeVersion: status.runtime.nodeVersion,
        uptimeSeconds: status.runtime.uptimeSeconds,
      },
    }
  }
  return context
}

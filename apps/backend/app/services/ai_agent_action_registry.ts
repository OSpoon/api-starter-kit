import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'

import type AiAgentConfirmation from '#models/ai_agent_confirmation'
import ApiKey from '#models/api_key'
import type { PermissionCode } from '#services/permission_catalog'

export type AiAgentActionName = 'revoke_api_key'

export type AiAgentActionPreparation = {
  targetType: string
  targetId: string
  targetSummary: Record<string, unknown>
  payload: Record<string, unknown>
}

export type AiAgentActionDefinition = {
  permission: PermissionCode
  prepare: (input: Record<string, unknown>) => Promise<AiAgentActionPreparation>
  execute: (input: { confirmation: AiAgentConfirmation; ctx: HttpContext }) => Promise<void>
}

const revokeApiKeyAction: AiAgentActionDefinition = {
  permission: 'api-keys:delete',
  async prepare(input) {
    const apiKeyId = input.apiKeyId
    if (typeof apiKeyId !== 'number' || !Number.isInteger(apiKeyId) || apiKeyId <= 0) {
      throw new Error('API Key 标识无效')
    }
    const apiKey = await ApiKey.find(apiKeyId)
    if (!apiKey) {
      throw new Error('API Key 不存在')
    }
    if (apiKey.revokedAt) {
      throw new Error('该 API Key 已被吊销')
    }

    return {
      targetType: 'api_key',
      targetId: String(apiKey.id),
      targetSummary: { name: apiKey.name, prefix: apiKey.prefix },
      payload: { apiKeyId: apiKey.id },
    }
  },
  async execute({ confirmation }) {
    const payload = confirmation.payload as { apiKeyId?: number }
    const apiKey = payload.apiKeyId ? await ApiKey.find(payload.apiKeyId) : null
    if (!apiKey || apiKey.revokedAt) {
      throw new Error('API Key 已不存在或已被吊销')
    }
    apiKey.revokedAt = DateTime.now()
    await apiKey.save()
  },
}

const aiAgentActions: Record<AiAgentActionName, AiAgentActionDefinition> = {
  revoke_api_key: revokeApiKeyAction,
}

export function getAiAgentAction(action: string) {
  return aiAgentActions[action as AiAgentActionName] ?? null
}

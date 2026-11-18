import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'

import { builtInAiAgentToolNames } from '#ai/core/ai_agent_tool_catalog'
import AiAgentConfiguration from '#models/ai_agent_configuration'

export async function getMineruToken() {
  const configuration = await AiAgentConfiguration.find(1)
  if (configuration?.mineruToken) {
    return encryption.decrypt<string>(configuration.mineruToken)
  }
  return null
}

export async function getMineruConfigurationStatus() {
  const token = await getMineruToken()
  if (!token) return { source: null, maskedToken: null }

  const mask = '••••••••'
  return {
    source: 'web' as const,
    maskedToken: token.length >= 20 ? `${token.slice(0, 8)}${mask}${token.slice(-4)}` : mask,
  }
}

export class MineruTokenRequiredError extends Error {}

export async function updateMineruToken(token: string | null | undefined, enable = false) {
  await db.transaction(async (trx) => {
    const now = new Date()
    await trx
      .table(AiAgentConfiguration.table)
      .insert({
        id: 1,
        enabled_tools: JSON.stringify(builtInAiAgentToolNames),
        created_at: now,
        updated_at: now,
      })
      .onConflict('id')
      .ignore()

    const configuration = await AiAgentConfiguration.query({ client: trx })
      .where('id', 1)
      .forUpdate()
      .firstOrFail()
    if (token !== undefined) configuration.mineruToken = token ? encryption.encrypt(token) : null
    if (enable && !configuration.mineruToken) {
      throw new MineruTokenRequiredError('请先配置 MinerU API Token')
    }
    if (enable && !configuration.enabledTools.includes('read_pdf_attachment')) {
      configuration.enabledTools = [...configuration.enabledTools, 'read_pdf_attachment']
    }
    await configuration.save()
  })
}

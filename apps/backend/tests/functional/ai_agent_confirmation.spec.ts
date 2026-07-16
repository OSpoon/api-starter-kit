import crypto from 'node:crypto'

import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'

import AiAgentConfirmation from '#models/ai_agent_confirmation'
import AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'
import ApiKey from '#models/api_key'
import AuditLog from '#models/audit_log'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { createAiAgentTools } from '#services/ai_agent_registry'
import { generateInitialPassword } from '#services/user_credentials'

async function createConfirmation(user: User) {
  const conversation = await AiChatConversation.create({ userId: user.id, title: 'Revoke key' })
  const message = await AiChatMessage.create({
    conversationId: conversation.id,
    role: 'assistant',
    content: 'A confirmation is required.',
  })
  const apiKey = await ApiKey.create({
    name: `Agent test key ${Date.now()}`,
    prefix: 'id_test_key',
    keyHash: `hash-${Date.now()}`,
  })
  const confirmation = await AiAgentConfirmation.create({
    conversationId: conversation.id,
    assistantMessageId: message.id,
    requestedByUserId: user.id,
    agentRunId: crypto.randomUUID(),
    action: 'revoke_api_key',
    targetType: 'api_key',
    targetId: String(apiKey.id),
    targetSummary: { name: apiKey.name, prefix: apiKey.prefix },
    payload: { apiKeyId: apiKey.id },
    status: 'pending',
    expiresAt: DateTime.now().plus({ minutes: 5 }),
  })

  return { apiKey, confirmation, conversation }
}

test.group('AI agent confirmations', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('confirms a proposed API Key revocation only for an authorized owner', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Confirmation admin',
      email: `confirmation-admin-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(user)
    const { apiKey, confirmation, conversation } = await createConfirmation(user)

    const response = await client
      .post(
        `/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${confirmation.id}/confirm`
      )
      .bearerToken(token.value!.release())

    response.assertStatus(200)
    const revokedApiKey = await ApiKey.findOrFail(apiKey.id)
    const confirmedRequest = await AiAgentConfirmation.findOrFail(confirmation.id)
    assert.isNotNull(revokedApiKey.revokedAt)
    assert.equal(confirmedRequest.status, 'confirmed')
    assert.exists(
      await AuditLog.query()
        .where('action', 'agent.action_confirmed')
        .where('target_id', String(apiKey.id))
        .first()
    )
  })

  test('denies confirmation when the current user lacks API Key delete permission', async ({
    client,
    assert,
  }) => {
    const readPermission = await Permission.findByOrFail('code', 'api-keys:read')
    const role = await Role.create({ code: `reader-${Date.now()}`, name: 'Reader' })
    await role.related('permissions').sync([readPermission.id])
    const user = await User.create({
      fullName: 'Confirmation reader',
      email: `confirmation-reader-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([role.id])
    const token = await User.accessTokens.create(user)
    const { apiKey, confirmation, conversation } = await createConfirmation(user)

    const response = await client
      .post(
        `/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${confirmation.id}/confirm`
      )
      .bearerToken(token.value!.release())

    response.assertStatus(403)
    const activeApiKey = await ApiKey.findOrFail(apiKey.id)
    const pendingRequest = await AiAgentConfirmation.findOrFail(confirmation.id)
    assert.isNull(activeApiKey.revokedAt)
    assert.equal(pendingRequest.status, 'pending')
  })

  test('returns a business result when proposing revocation for an unknown API Key', async ({
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Unknown key admin',
      email: `unknown-key-admin-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const proposalTool = createAiAgentTools({
      userId: user.id,
      conversationId: 1,
      agentRunId: crypto.randomUUID(),
    }).find((tool) => tool.name === 'propose_system_management_change')

    const output = await proposalTool!.invoke({
      action: 'revoke_api_key',
      input: { apiKeyId: 999_999_999 },
    })

    assert.deepEqual(JSON.parse(String(output)), {
      kind: 'action_error',
      message: 'API Key 不存在',
    })
  })
})

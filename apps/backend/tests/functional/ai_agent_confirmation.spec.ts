import crypto from 'node:crypto'

import testUtils from '@adonisjs/core/services/test_utils'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'

import {
  aiAgentActionNames,
  genericProposalActionNames,
  getAiAgentAction,
} from '#ai/core/ai_agent_action_registry'
import { proposeAiAgentAction } from '#ai/core/ai_agent_confirmation'
import { createAiAgentTools } from '#ai/registry/ai_agent_tool_registry'
import AiAgentConfirmation from '#models/ai_agent_confirmation'
import AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'
import ApiKey from '#models/api_key'
import AuditLog from '#models/audit_log'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import WecomMessageTemplate from '#models/wecom_message_template'
import { generateInitialPassword } from '#security/user_credentials'
import { getChannelGuestUser } from '#services/channel_guest_principal'

async function executeTool(tool: AgentTool, input: unknown) {
  const result = await tool.execute('test-call', input)
  return JSON.stringify(result.details)
}

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

  test('classifies registered action impact on the server', ({ assert }) => {
    for (const action of aiAgentActionNames) {
      assert.isNotNull(getAiAgentAction(action), `Missing action registration: ${action}`)
    }
    assert.notInclude(genericProposalActionNames, 'create_api_key')
    assert.equal(getAiAgentAction('revoke_api_key')?.impact, 'destructive')
    assert.equal(getAiAgentAction('delete_api_key')?.impact, 'destructive')
    assert.equal(getAiAgentAction('create_api_key')?.impact, 'standard')
  })

  test('refuses AI proposals to mutate the internal channel guest account', async ({ assert }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const admin = await User.create({
      fullName: 'Channel guest action admin',
      email: `channel-guest-action-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await admin.related('roles').sync([superAdminRole.id])
    const guest = await getChannelGuestUser()
    const conversation = await AiChatConversation.create({
      userId: admin.id,
      title: 'Protect internal channel guest',
    })
    const proposalTool = createAiAgentTools({
      userId: admin.id,
      conversationId: conversation.id,
      agentRunId: crypto.randomUUID(),
    }).find((tool) => tool.name === 'propose_system_management_change')
    const changes = [
      { action: 'reset_user_password', input: { email: guest.email } },
      { action: 'disable_user', input: { email: guest.email } },
      { action: 'enable_user', input: { email: guest.email } },
      {
        action: 'update_user',
        input: { email: guest.email, fullName: guest.fullName, roleIds: [] },
      },
      { action: 'delete_user', input: { email: guest.email } },
    ]

    for (const change of changes) {
      const result = JSON.parse(await executeTool(proposalTool!, change))
      assert.equal(result.kind, 'action_error', change.action)
      assert.include(result.message, '系统内部用户不可管理')
    }

    assert.isNull(
      await AiAgentConfirmation.query().where('conversationId', conversation.id).first()
    )
    assert.isNotNull(await User.find(guest.id))
  })

  test('rechecks the channel guest restriction when an AI action is confirmed', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const admin = await User.create({
      fullName: 'Channel guest confirmation admin',
      email: `channel-guest-confirm-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await admin.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(admin)
    const guest = await getChannelGuestUser()
    const conversation = await AiChatConversation.create({
      userId: admin.id,
      title: 'Revalidate protected user',
    })
    const message = await AiChatMessage.create({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'A protected user action confirmation.',
    })
    const confirmation = await AiAgentConfirmation.create({
      conversationId: conversation.id,
      assistantMessageId: message.id,
      requestedByUserId: admin.id,
      agentRunId: crypto.randomUUID(),
      action: 'delete_user',
      targetType: 'user',
      targetId: String(guest.id),
      targetSummary: { fullName: guest.fullName, email: guest.email },
      payload: { userId: guest.id },
      status: 'pending',
      expiresAt: DateTime.now().plus({ minutes: 5 }),
    })

    const response = await client
      .post(
        `/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${confirmation.id}/confirm`
      )
      .bearerToken(token.value!.release())

    response.assertStatus(409)
    assert.isNotNull(await User.find(guest.id))
    const failedConfirmation = await AiAgentConfirmation.findOrFail(confirmation.id)
    assert.equal(failedConfirmation.status, 'failed')
  })

  test('rechecks self-role and super-admin protections through the shared AI mutation service', async ({
    client,
    assert,
  }) => {
    const updatePermission = await Permission.findByOrFail('code', 'users:update')
    const operatorRole = await Role.create({
      code: `ai-role-operator-${Date.now()}`,
      name: 'AI operator',
    })
    await operatorRole.related('permissions').sync([updatePermission.id])
    const operator = await User.create({
      fullName: 'AI role operator',
      email: `ai-role-operator-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await operator.related('roles').sync([operatorRole.id])
    const token = await User.accessTokens.create(operator)
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const protectedAdmin = await User.create({
      fullName: 'AI protected admin',
      email: `ai-protected-admin-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await protectedAdmin.related('roles').sync([superAdminRole.id])
    const conversation = await AiChatConversation.create({
      userId: operator.id,
      title: 'Shared role protections',
    })
    const proposalTool = createAiAgentTools({
      userId: operator.id,
      conversationId: conversation.id,
      agentRunId: crypto.randomUUID(),
    }).find((tool) => tool.name === 'propose_system_management_change')

    const selfProposal = JSON.parse(
      await executeTool(proposalTool!, {
        action: 'update_user',
        input: {
          userId: operator.id,
          fullName: operator.fullName,
          email: operator.email,
          roleIds: [],
        },
      })
    )
    assert.equal(selfProposal.kind, 'confirmation')
    const selfResponse = await client
      .post(
        `/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${selfProposal.confirmation.id}/confirm`
      )
      .bearerToken(token.value!.release())
    selfResponse.assertStatus(409)
    const unchangedOperator = await User.query()
      .where('id', operator.id)
      .preload('roles')
      .firstOrFail()
    assert.equal(unchangedOperator.roles[0]?.id, operatorRole.id)

    const adminProposal = JSON.parse(
      await executeTool(proposalTool!, {
        action: 'update_user',
        input: {
          userId: protectedAdmin.id,
          fullName: protectedAdmin.fullName,
          email: protectedAdmin.email,
          roleIds: [superAdminRole.id],
        },
      })
    )
    assert.equal(adminProposal.kind, 'confirmation')
    const adminResponse = await client
      .post(
        `/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${adminProposal.confirmation.id}/confirm`
      )
      .bearerToken(token.value!.release())
    adminResponse.assertStatus(409)
    const unchangedAdmin = await User.query()
      .where('id', protectedAdmin.id)
      .preload('roles')
      .firstOrFail()
    assert.deepEqual(
      unchangedAdmin.roles.map((role) => role.id),
      [superAdminRole.id]
    )
  })

  test('prepares API Key creation through direct fields and one confirmation', async ({
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'API Key creation admin',
      email: `api-key-create-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Create API Key',
    })
    const tools = createAiAgentTools({
      userId: user.id,
      conversationId: conversation.id,
      agentRunId: crypto.randomUUID(),
    })
    const genericTool = tools.find(
      (registeredTool) => registeredTool.name === 'propose_system_management_change'
    )
    const genericOutput = JSON.parse(
      await executeTool(genericTool!, {
        action: 'create_api_key',
        input: { name: 'generic-api-key' },
      })
    )
    assert.equal(genericOutput.kind, 'action_error')
    assert.equal(genericOutput.code, 'invalid_input')

    const tool = tools.find((registeredTool) => registeredTool.name === 'propose_api_key_creation')

    const output = JSON.parse(
      await executeTool(tool!, { name: 'default-api-key', expiresIn: 'long' })
    )

    assert.equal(output.kind, 'confirmation')
    assert.equal(output.confirmation.action, 'create_api_key')
    assert.equal(output.confirmation.targetSummary.name, 'default-api-key')
    assert.equal(output.confirmation.changeSummary[0].value, 'default-api-key')
    assert.isUndefined(output.confirmation.payload)
  })

  test('normalizes a nested API Key target before preparing revocation', async ({ assert }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Nested target admin',
      email: `nested-target-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const apiKey = await ApiKey.create({
      name: `Nested target key ${Date.now()}`,
      prefix: 'nested_target',
      keyHash: `hash-nested-${Date.now()}`,
    })
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Nested target',
    })
    const tool = createAiAgentTools({
      userId: user.id,
      conversationId: conversation.id,
      agentRunId: crypto.randomUUID(),
    }).find((registeredTool) => registeredTool.name === 'propose_api_key_revocation')

    const output = JSON.parse(await executeTool(tool!, { input: { id: apiKey.id } }))

    assert.equal(output.kind, 'confirmation')
    assert.equal(output.confirmation.targetId, String(apiKey.id))
  })

  test('reuses a pending proposal when the same agent run retries an action', async ({
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Idempotent proposal admin',
      email: `idempotent-proposal-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Idempotent action',
    })
    const apiKey = await ApiKey.create({
      name: `Idempotent key ${Date.now()}`,
      prefix: `i${Date.now()}`,
      keyHash: `hash-${Date.now()}`,
    })
    const input = {
      action: 'revoke_api_key',
      actionInput: { apiKeyId: apiKey.id },
      conversationId: conversation.id,
      userId: user.id,
      agentRunId: crypto.randomUUID(),
    }

    const first = await proposeAiAgentAction(input)
    const retry = await proposeAiAgentAction(input)

    assert.equal(retry.id, first.id)
    assert.equal(retry.impact, 'destructive')
    assert.lengthOf(await AiAgentConfirmation.query().where('agent_run_id', input.agentRunId), 1)
  })

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
    const assistantMessage = await AiChatMessage.findOrFail(confirmation.assistantMessageId)
    assert.isNotNull(revokedApiKey.revokedAt)
    assert.equal(confirmedRequest.status, 'confirmed')
    assert.deepInclude(assistantMessage.runtimeDetails.at(-1), {
      kind: 'confirmation',
      action: 'revoke_api_key',
      status: 'confirmed',
    })
    assert.exists(
      await AuditLog.query()
        .where('action', 'agent.action_confirmed')
        .where('target_id', String(apiKey.id))
        .first()
    )
    assert.exists(
      await AuditLog.query()
        .where('action', 'api_key.revoked')
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
    assert.isNull(pendingRequest.executionToken)
  })

  test('claims a confirmation before execution so concurrent approvals run only once', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Concurrent confirmation admin',
      email: `concurrent-confirmation-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(user)
    const { apiKey, confirmation, conversation } = await createConfirmation(user)
    const endpoint = `/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${confirmation.id}/confirm`

    const [first, second] = await Promise.all([
      client.post(endpoint).bearerToken(token.value!.release()),
      client.post(endpoint).bearerToken(token.value!.release()),
    ])

    assert.sameMembers([first.status(), second.status()], [200, 409])
    const revokedApiKey = await ApiKey.findOrFail(apiKey.id)
    assert.isNotNull(revokedApiKey.revokedAt)
    const auditEvents = await AuditLog.query()
      .where('action', 'api_key.revoked')
      .where('target_id', apiKey.id)
    assert.equal(auditEvents.length, 1)
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
    }).find((tool) => tool.name === 'propose_api_key_revocation')

    const output = await executeTool(proposalTool!, {
      apiKeyId: 999_999_999,
    })

    assert.deepEqual(JSON.parse(String(output)), {
      kind: 'action_error',
      code: 'failed',
      message: 'API Key 不存在',
    })
  })

  test('resolves an API Key by its exact name when no ID is supplied', async ({ assert }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Name resolver admin',
      email: `name-resolver-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Name resolver action',
    })
    const apiKey = await ApiKey.create({
      name: `Resolvable key ${Date.now()}`,
      prefix: `r${Date.now()}`,
      keyHash: `hash-${Date.now()}`,
    })
    const proposalTool = createAiAgentTools({
      userId: user.id,
      conversationId: conversation.id,
      agentRunId: crypto.randomUUID(),
    }).find((tool) => tool.name === 'propose_api_key_revocation')

    const output = await executeTool(proposalTool!, {
      name: apiKey.name,
    })

    const content = JSON.parse(String(output))
    assert.equal(content.kind, 'confirmation', JSON.stringify(content))
    assert.equal(content.confirmation.targetId, String(apiKey.id))
  })

  test('returns a safe change summary without exposing the proposal payload', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Summary admin',
      email: `summary-admin-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(user)
    const { confirmation, conversation } = await createConfirmation(user)

    const response = await client
      .get(`/api/v1/ai-chat/conversations/${conversation.id}`)
      .bearerToken(token.value!.release())

    response.assertStatus(200)
    const confirmationSummary = response.body().data.confirmations[0]
    assert.equal(confirmationSummary.impact, 'destructive')
    assert.deepEqual(confirmationSummary.changeSummary, [{ field: 'result', value: 'revoked' }])
    assert.notProperty(confirmationSummary, 'payload')
    assert.equal(confirmationSummary.id, confirmation.id)
  })

  test('proposes deleting an already-revoked API Key', async ({ assert }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Revoked key deletion admin',
      email: `revoked-key-deletion-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Revoked key deletion action',
    })
    const apiKey = await ApiKey.create({
      name: `Revoked key ${Date.now()}`,
      prefix: `rd${Date.now()}`,
      keyHash: `hash-${Date.now()}`,
      revokedAt: DateTime.now(),
    })
    const proposalTool = createAiAgentTools({
      userId: user.id,
      conversationId: conversation.id,
      agentRunId: crypto.randomUUID(),
    }).find((tool) => tool.name === 'propose_api_key_deletion')

    const output = await executeTool(proposalTool!, {
      name: apiKey.name,
    })

    const content = JSON.parse(String(output))
    assert.equal(content.kind, 'confirmation', JSON.stringify(content))
    assert.equal(content.confirmation.action, 'delete_api_key')
    assert.equal(content.confirmation.targetId, String(apiKey.id))
  })

  test('refuses to delete an API Key that is still active', async ({ assert }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Active key deletion admin',
      email: `active-key-deletion-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const apiKey = await ApiKey.create({
      name: `Active key ${Date.now()}`,
      prefix: `ad${Date.now()}`,
      keyHash: `hash-${Date.now()}`,
    })
    const proposalTool = createAiAgentTools({
      userId: user.id,
      conversationId: 1,
      agentRunId: crypto.randomUUID(),
    }).find((tool) => tool.name === 'propose_api_key_deletion')

    const output = await executeTool(proposalTool!, {
      apiKeyId: apiKey.id,
    })

    assert.deepEqual(JSON.parse(String(output)), {
      kind: 'action_error',
      code: 'failed',
      message: '仅已吊销的 API Key 可被删除，请改用 revoke_api_key 操作',
    })
  })

  test('denies deleting an API Key proposal without the delete permission', async ({ assert }) => {
    const user = await User.create({
      fullName: 'Deletion proposal reader',
      email: `deletion-proposal-reader-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const apiKey = await ApiKey.create({
      name: `Denied deletion key ${Date.now()}`,
      prefix: `dd${Date.now()}`,
      keyHash: `hash-${Date.now()}`,
      revokedAt: DateTime.now(),
    })
    const proposalTool = createAiAgentTools({
      userId: user.id,
      conversationId: 1,
      agentRunId: crypto.randomUUID(),
    }).find((tool) => tool.name === 'propose_api_key_deletion')

    const output = await executeTool(proposalTool!, {
      apiKeyId: apiKey.id,
    })

    assert.deepEqual(JSON.parse(String(output)), {
      kind: 'action_error',
      code: 'permission_denied',
      message: '当前账号没有执行此操作的权限',
    })
    assert.isNull(await AiAgentConfirmation.query().where('requested_by_user_id', user.id).first())
  })

  test('confirms deleting an already-revoked API Key for an authorized owner', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Deletion confirmation admin',
      email: `deletion-confirmation-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(user)
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Revoked key deletion confirmation',
    })
    const message = await AiChatMessage.create({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'A deletion confirmation is required.',
    })
    const apiKey = await ApiKey.create({
      name: `Revoked deletion key ${Date.now()}`,
      prefix: `cd${Date.now()}`,
      keyHash: `hash-${Date.now()}`,
      revokedAt: DateTime.now(),
    })
    const confirmation = await AiAgentConfirmation.create({
      conversationId: conversation.id,
      assistantMessageId: message.id,
      requestedByUserId: user.id,
      agentRunId: crypto.randomUUID(),
      action: 'delete_api_key',
      targetType: 'api_key',
      targetId: String(apiKey.id),
      targetSummary: { name: apiKey.name, prefix: apiKey.prefix },
      payload: { apiKeyId: apiKey.id },
      status: 'pending',
      expiresAt: DateTime.now().plus({ minutes: 5 }),
    })

    const response = await client
      .post(
        `/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${confirmation.id}/confirm`
      )
      .bearerToken(token.value!.release())

    response.assertStatus(200)
    assert.isNull(await ApiKey.find(apiKey.id))
    const confirmedRequest = await AiAgentConfirmation.findOrFail(confirmation.id)
    assert.equal(confirmedRequest.status, 'confirmed')
    assert.exists(
      await AuditLog.query()
        .where('action', 'api_key.deleted')
        .where('target_id', String(apiKey.id))
        .first()
    )
  })

  test('returns a terminal business result instead of throwing when proposal permission is denied', async ({
    assert,
  }) => {
    const user = await User.create({
      fullName: 'Proposal reader',
      email: `proposal-reader-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const apiKey = await ApiKey.create({
      name: `Denied proposal key ${Date.now()}`,
      prefix: 'id_denied_key',
      keyHash: `hash-${Date.now()}`,
    })
    const proposalTool = createAiAgentTools({
      userId: user.id,
      conversationId: 1,
      agentRunId: crypto.randomUUID(),
    }).find((tool) => tool.name === 'propose_api_key_revocation')

    const output = await executeTool(proposalTool!, {
      apiKeyId: apiKey.id,
    })

    assert.deepEqual(JSON.parse(String(output)), {
      kind: 'action_error',
      code: 'permission_denied',
      message: '当前账号没有执行此操作的权限',
    })
    assert.isNull(await AiAgentConfirmation.query().where('requested_by_user_id', user.id).first())
  })

  test('audits when a user tries to confirm an already-expired proposal', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Expired confirmation admin',
      email: `expired-confirmation-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(user)
    const { apiKey, confirmation, conversation } = await createConfirmation(user)
    await AiAgentConfirmation.query()
      .where('id', confirmation.id)
      .update({
        expiresAt: DateTime.now().minus({ minutes: 1 }),
      })

    const response = await client
      .post(
        `/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${confirmation.id}/confirm`
      )
      .bearerToken(token.value!.release())

    response.assertStatus(422)
    const expiredConfirmation = await AiAgentConfirmation.findOrFail(confirmation.id)
    assert.equal(expiredConfirmation.status, 'expired')
    assert.exists(
      await AuditLog.query()
        .where('action', 'agent.proposal_expired')
        .where('target_id', String(apiKey.id))
        .first()
    )
  })

  test('audits orphaned confirmations when an agent run ends without attaching them', async ({
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Orphan confirmations admin',
      email: `orphan-confirmation-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Orphan run',
    })
    const apiKey = await ApiKey.create({
      name: `Orphan key ${Date.now()}`,
      prefix: `o${Date.now()}`,
      keyHash: `hash-${Date.now()}`,
    })
    const agentRunId = crypto.randomUUID()
    await AiAgentConfirmation.create({
      conversationId: conversation.id,
      requestedByUserId: user.id,
      agentRunId,
      action: 'revoke_api_key',
      targetType: 'api_key',
      targetId: String(apiKey.id),
      targetSummary: { name: apiKey.name },
      payload: { apiKeyId: apiKey.id },
      status: 'pending',
      expiresAt: DateTime.now().plus({ minutes: 5 }),
    })

    const fakeContext = {
      request: { id: () => 'test-request-id', ip: () => '127.0.0.1', header: () => null },
    } as unknown as import('@adonisjs/core/http').HttpContext
    const { failUnattachedAgentRunConfirmations } = await import('#ai/core/ai_agent_confirmation')
    await failUnattachedAgentRunConfirmations({
      conversationId: conversation.id,
      userId: user.id,
      agentRunId,
      ctx: fakeContext,
    })

    const failedConfirmation = await AiAgentConfirmation.query()
      .where('conversation_id', conversation.id)
      .firstOrFail()
    assert.equal(failedConfirmation.status, 'failed')
    assert.exists(
      await AuditLog.query()
        .where('action', 'agent.proposal_failed')
        .where('target_id', String(apiKey.id))
        .first()
    )
  })

  test('requires send permission and confirmation for WeCom message delivery', async ({
    assert,
  }) => {
    const template = await WecomMessageTemplate.create({
      name: `AI send template ${Date.now()}`,
      description: 'AI send test template',
      msgtype: 'text',
      webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret',
      payload: {
        msgtype: 'text',
        text: { content: '{{content}}' },
      },
      parameters: [{ name: 'content', type: 'string', required: true }],
      enabled: true,
    })
    const readerPermission = await Permission.findByOrFail('code', 'wecom-templates:read')
    const readerRole = await Role.create({
      code: `wecom-reader-${Date.now()}`,
      name: 'WeCom reader',
    })
    await readerRole.related('permissions').sync([readerPermission.id])
    const reader = await User.create({
      fullName: 'WeCom reader',
      email: `wecom-reader-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await reader.related('roles').sync([readerRole.id])
    const deniedTool = createAiAgentTools({
      userId: reader.id,
      conversationId: 1,
      agentRunId: crypto.randomUUID(),
    }).find((tool) => tool.name === 'propose_wecom_message_send')
    const denied = await executeTool(deniedTool!, {
      templateId: template.id,
      params: { content: '不应发送' },
    })
    assert.deepEqual(JSON.parse(String(denied)), {
      kind: 'action_error',
      code: 'permission_denied',
      message: '当前账号没有执行此操作的权限',
    })

    const adminRole = await Role.findByOrFail('code', 'super-admin')
    const admin = await User.create({
      fullName: 'WeCom sender',
      email: `wecom-sender-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await admin.related('roles').sync([adminRole.id])
    const conversation = await AiChatConversation.create({ userId: admin.id, title: 'WeCom send' })
    const proposalTool = createAiAgentTools({
      userId: admin.id,
      conversationId: conversation.id,
      agentRunId: crypto.randomUUID(),
    }).find((tool) => tool.name === 'propose_wecom_message_send')
    const proposal = JSON.parse(
      String(
        await executeTool(proposalTool!, {
          templateId: template.id,
          params: { content: '业务内容' },
          mentionedList: ['zhangsan'],
        })
      )
    )
    assert.equal(proposal.kind, 'confirmation')
    assert.notInclude(JSON.stringify(proposal), '业务内容')
    assert.include(JSON.stringify(proposal), 'content')
    const stored = await AiAgentConfirmation.findOrFail(proposal.confirmation.id)
    assert.equal(stored.status, 'pending')
    assert.notInclude(JSON.stringify(stored.payload), '业务内容')
  })
})

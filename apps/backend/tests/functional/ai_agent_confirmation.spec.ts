import crypto from 'node:crypto'

import testUtils from '@adonisjs/core/services/test_utils'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { ZodError } from 'zod'

import {
  getConfirmedToolResultFallback,
  summarizeConfirmedToolResult,
} from '#ai/chat/confirmed_tool_result_summary'
import {
  aiAgentActionNames,
  executeAiAgentActionImmediately,
  genericProposalActionNames,
  getAiAgentAction,
} from '#ai/core/ai_agent_action_registry'
import {
  AiAgentConfirmationError,
  type AiAgentConfirmationSummary,
  attachAgentRunConfirmations,
  findPendingConfirmationTool,
  proposeAiAgentAction,
} from '#ai/core/ai_agent_confirmation'
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
import {
  getAiAgentToolSettings,
  updateAiAgentToolSettings,
} from '#services/ai_agent_configuration_service'
import { getChannelGuestUser } from '#services/channel_guest_principal'

async function executeTool(tool: AgentTool, input: unknown) {
  const confirmationTool = tool as AgentTool & {
    prepareConfirmation?: (args: unknown) => Promise<AiAgentConfirmationSummary>
  }
  if (confirmationTool.prepareConfirmation) {
    try {
      return JSON.stringify(await confirmationTool.prepareConfirmation(input))
    } catch (error) {
      return JSON.stringify({
        kind: 'action_error',
        code: error instanceof ZodError ? 'invalid_input' : 'failed',
        message: error instanceof Error ? error.message : '操作准备失败',
      })
    }
  }
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
  message.runtimeDetails = [
    {
      kind: 'tool',
      name: 'revoke_api_key',
      state: 'done',
      callId: `revoke-api-key-${confirmation.id}`,
      phase: 'awaiting_confirmation',
      message: '等待用户确认后执行',
      detail: { action: confirmation.action, confirmationId: confirmation.id },
    },
  ]
  await message.save()

  return { apiKey, confirmation, conversation }
}

async function createDisableUserConfirmation(actor: User, target: User) {
  const conversation = await AiChatConversation.create({ userId: actor.id, title: 'Disable admin' })
  const message = await AiChatMessage.create({
    conversationId: conversation.id,
    role: 'assistant',
    content: 'A confirmation is required.',
  })
  const confirmation = await AiAgentConfirmation.create({
    conversationId: conversation.id,
    assistantMessageId: message.id,
    requestedByUserId: actor.id,
    agentRunId: crypto.randomUUID(),
    action: 'disable_user',
    targetType: 'user',
    targetId: String(target.id),
    targetSummary: { fullName: target.fullName, email: target.email },
    payload: { userId: target.id },
    status: 'pending',
    expiresAt: DateTime.now().plus({ minutes: 5 }),
  })
  return { confirmation, conversation }
}

test.group('AI agent confirmations', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('classifies registered action impact on the server', ({ assert }) => {
    for (const action of aiAgentActionNames) {
      assert.isNotNull(getAiAgentAction(action), `Missing action registration: ${action}`)
    }
    assert.notInclude(genericProposalActionNames, 'create_api_key')
    assert.include(genericProposalActionNames, 'create_user')
    assert.notInclude(aiAgentActionNames, 'create_permission')
    assert.notInclude(aiAgentActionNames, 'update_permission')
    assert.notInclude(aiAgentActionNames, 'delete_permission')
    assert.equal(getAiAgentAction('revoke_api_key')?.impact, 'destructive')
    assert.equal(getAiAgentAction('delete_api_key')?.impact, 'destructive')
    assert.equal(getAiAgentAction('create_api_key')?.impact, 'standard')
  })

  test('matches one pending confirmation tool without action metadata but avoids ambiguous matches', ({
    assert,
  }) => {
    const pendingTool = {
      kind: 'tool' as const,
      name: 'run_registered_query',
      state: 'done' as const,
      phase: 'awaiting_confirmation',
      callId: 'query-call',
      detail: {},
    }
    const otherPendingTool = { ...pendingTool, callId: 'other-call' }

    assert.equal(findPendingConfirmationTool([pendingTool], 42, 'call_builtin_tool'), pendingTool)
    assert.isUndefined(
      findPendingConfirmationTool([pendingTool, otherPendingTool], 42, 'call_builtin_tool')
    )
    assert.isUndefined(
      findPendingConfirmationTool(
        [{ ...pendingTool, detail: { confirmationId: 7 } }],
        42,
        'call_builtin_tool'
      )
    )
    const actionTool = { ...pendingTool, detail: { action: 'call_builtin_tool' } }
    const otherActionTool = { ...otherPendingTool, detail: { action: 'call_builtin_tool' } }
    assert.isUndefined(
      findPendingConfirmationTool([actionTool, otherActionTool], 42, 'call_builtin_tool')
    )
  })

  test('appends the confirmed tool reply to the original assistant message', async ({ assert }) => {
    const user = await User.create({
      fullName: 'Confirmed tool result user',
      email: `confirmed-tool-result-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const conversation = await AiChatConversation.create({ userId: user.id, title: 'Tool result' })
    const assistantMessage = await AiChatMessage.create({
      conversationId: conversation.id,
      role: 'assistant',
      content: '正在等待确认。',
    })
    const events: Array<{ event: string; data: unknown }> = []

    const result = await summarizeConfirmedToolResult({
      ctx: {} as never,
      conversation,
      assistantMessage,
      userId: user.id,
      result: { mcpToolName: 'search_logs', mcpToolResult: '' },
      onEvent: (event, data) => {
        events.push({ event, data })
      },
    })

    assert.include(result.reply, '没有返回可供整理的文本结果')
    assert.equal(result.message.id, assistantMessage.id)
    const savedMessage = await AiChatMessage.findOrFail(assistantMessage.id)
    assert.include(savedMessage.content, '正在等待确认。\n\n')
    assert.include(savedMessage.content, result.reply)
    assert.deepInclude(events[0], { event: 'delta', data: { content: '\n\n' + result.reply } })
    assert.notInclude(
      events.map(({ event }) => event),
      'assistant_segment_start'
    )
  })

  test('includes the concrete result when the assistant cannot summarize it', ({ assert }) => {
    const fallback = getConfirmedToolResultFallback('search_logs', '{"items":[{"id":42}]}')

    assert.include(fallback, 'search_logs')
    assert.include(fallback, '{"items":[{"id":42}]}')
    assert.include(fallback, '已执行成功')
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
    }).find((tool) => tool.name === 'system_management_change')
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
    }).find((tool) => tool.name === 'system_management_change')

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
    assert.equal(selfProposal.action, 'update_user')
    const selfResponse = await client
      .post(
        `/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${selfProposal.id}/confirm`
      )
      .bearerToken(token.value!.release())
    selfResponse.assertStatus(409)
    const unchangedOperator = await User.query()
      .where('id', operator.id)
      .preload('roles')
      .firstOrFail()
    assert.equal(unchangedOperator.roles[0]?.id, operatorRole.id)

    const adminResult = JSON.parse(
      await executeTool(proposalTool!, {
        action: 'update_user',
        input: {
          userId: protectedAdmin.id,
          fullName: protectedAdmin.fullName,
          email: protectedAdmin.email,
          roleIds: [],
        },
      })
    )
    assert.equal(adminResult.kind, 'action_error')
    assert.include(adminResult.message, '仅超级管理员可以维护超级管理员账户')
    assert.isNull(
      await AiAgentConfirmation.query()
        .where('conversation_id', conversation.id)
        .where('target_id', String(protectedAdmin.id))
        .first()
    )
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
      (registeredTool) => registeredTool.name === 'system_management_change'
    )
    const genericOutput = JSON.parse(
      await executeTool(genericTool!, {
        action: 'create_api_key',
        input: { name: 'generic-api-key' },
      })
    )
    assert.equal(genericOutput.kind, 'action_error')
    assert.equal(genericOutput.code, 'invalid_input')

    const tool = tools.find((registeredTool) => registeredTool.name === 'create_api_key')

    const output = JSON.parse(
      await executeTool(tool!, { name: 'default-api-key', expiresIn: 'long' })
    )

    assert.equal(output.action, 'create_api_key')
    assert.equal(output.targetSummary.name, 'default-api-key')
    assert.equal(output.changeSummary[0].value, 'default-api-key')
    assert.isUndefined(output.payload)
  })

  test('creates a role only with permissions the operator is allowed to grant', async ({
    client,
    assert,
  }) => {
    const rolesCreate = await Permission.findByOrFail('code', 'roles:create')
    const apiKeysCreate = await Permission.findByOrFail('code', 'api-keys:create')
    const operatorRole = await Role.create({
      code: `agent-role-operator-${Date.now()}`,
      name: 'AI role operator',
    })
    await operatorRole.related('permissions').sync([rolesCreate.id, apiKeysCreate.id])
    const user = await User.create({
      fullName: 'Agent role operator',
      email: `agent-role-create-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([operatorRole.id])
    const token = await User.accessTokens.create(user)
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Create configured role',
    })
    const assistantMessage = await AiChatMessage.create({
      conversationId: conversation.id,
      role: 'assistant',
      content: '',
    })
    const code = `agent-configured-${Date.now()}`
    const tool = createAiAgentTools({
      userId: user.id,
      conversationId: conversation.id,
      agentRunId: crypto.randomUUID(),
    }).find((registeredTool) => registeredTool.name === 'system_management_change')
    const proposal = JSON.parse(
      await executeTool(tool!, {
        action: 'create_role',
        input: { code, name: 'Agent configured role', permissionIds: [apiKeysCreate.id] },
      })
    )

    assert.equal(proposal.action, 'create_role')
    const confirmation = await AiAgentConfirmation.findOrFail(proposal.id)
    confirmation.assistantMessageId = assistantMessage.id
    await confirmation.save()
    const response = await client
      .post(`/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${proposal.id}/confirm`)
      .bearerToken(token.value!.release())
    response.assertStatus(200)

    const role = await Role.query().where('code', code).preload('permissions').firstOrFail()
    assert.deepEqual(
      role.permissions.map(({ id }) => id),
      [apiKeysCreate.id]
    )
  })

  test('does not let role or user proposals grant permissions the operator lacks', async ({
    assert,
  }) => {
    const rolesCreate = await Permission.findByOrFail('code', 'roles:create')
    const usersCreate = await Permission.findByOrFail('code', 'users:create')
    const apiKeysCreate = await Permission.findByOrFail('code', 'api-keys:create')
    const operatorRole = await Role.create({
      code: `agent-limited-operator-${Date.now()}`,
      name: 'AI limited operator',
    })
    await operatorRole.related('permissions').sync([rolesCreate.id, usersCreate.id])
    const targetRole = await Role.create({
      code: `agent-elevated-target-${Date.now()}`,
      name: 'Elevated target role',
    })
    await targetRole.related('permissions').sync([apiKeysCreate.id])
    const user = await User.create({
      fullName: 'Limited AI operator',
      email: `agent-limited-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([operatorRole.id])
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Reject permission escalation',
    })
    const tool = createAiAgentTools({
      userId: user.id,
      conversationId: conversation.id,
      agentRunId: crypto.randomUUID(),
    }).find((registeredTool) => registeredTool.name === 'system_management_change')
    const createRoleResult = JSON.parse(
      await executeTool(tool!, {
        action: 'create_role',
        input: {
          code: `agent-forbidden-role-${Date.now()}`,
          name: 'Forbidden role',
          permissionIds: [apiKeysCreate.id],
        },
      })
    )
    const createUserResult = JSON.parse(
      await executeTool(tool!, {
        action: 'create_user',
        input: {
          fullName: 'Forbidden user',
          email: `agent-forbidden-user-${Date.now()}@example.com`,
          roleIds: [targetRole.id],
        },
      })
    )

    for (const result of [createRoleResult, createUserResult]) {
      assert.equal(result.kind, 'action_error')
      assert.include(result.message, '只能授予自己拥有的权限')
    }
    assert.isNull(
      await AiAgentConfirmation.query().where('conversation_id', conversation.id).first()
    )
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
    }).find((registeredTool) => registeredTool.name === 'revoke_api_key')

    const output = JSON.parse(await executeTool(tool!, { input: { id: apiKey.id } }))

    assert.equal(output.action, 'revoke_api_key')
    assert.equal(output.targetId, String(apiKey.id))
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
    assert.equal(first.presentation.summary, '请确认是否执行以下操作。')
    assert.deepInclude(first.presentation.changes, {
      label: '操作结果',
      value: '吊销（待确认）',
    })
    assert.lengthOf(await AiAgentConfirmation.query().where('agent_run_id', input.agentRunId), 1)
  })

  test('labels configurable built-in tool confirmations by their actual type', async ({
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Confirmation type admin',
      email: `confirmation-type-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Tool type confirmation',
    })
    const settings = await getAiAgentToolSettings()
    await updateAiAgentToolSettings(
      settings.map((setting) =>
        setting.code === 'run_registered_query' ? { ...setting, mode: 'confirm' } : setting
      )
    )
    const queryConfirmation = await proposeAiAgentAction({
      action: 'call_builtin_tool',
      actionInput: {
        toolName: 'run_registered_query',
        arguments: { templateCode: 'recent_audit_logs', params: {} },
      },
      conversationId: conversation.id,
      userId: user.id,
      agentRunId: crypto.randomUUID(),
    })
    assert.equal(queryConfirmation.presentation.title, '确认调用工具')
    assert.deepInclude(queryConfirmation.presentation.changes, {
      label: '工具',
      value: 'run_registered_query',
    })
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
    const responseData = response.body().data as {
      message: { id: number; content: string }
      presentation: { summary: string; changes: Array<{ label: string; value: string }> }
    }
    const responseMessage = responseData.message
    assert.equal(responseData.presentation.summary, '操作已执行。')
    assert.deepInclude(responseData.presentation.changes, {
      label: '操作结果',
      value: '吊销（已执行）',
    })
    assert.equal(responseMessage.id, confirmation.assistantMessageId)
    assert.include(responseMessage.content, 'API Key')
    assert.include(responseMessage.content, '已吊销')
    assert.lengthOf(
      await AiChatMessage.query()
        .where('conversation_id', conversation.id)
        .where('role', 'assistant'),
      1
    )
    const revokedApiKey = await ApiKey.findOrFail(apiKey.id)
    const confirmedRequest = await AiAgentConfirmation.findOrFail(confirmation.id)
    const assistantMessage = await AiChatMessage.findOrFail(confirmation.assistantMessageId)
    assert.isNotNull(revokedApiKey.revokedAt)
    assert.equal(confirmedRequest.status, 'confirmed')
    assert.lengthOf(assistantMessage.runtimeDetails, 1)
    assert.deepInclude(assistantMessage.runtimeDetails[0], {
      kind: 'tool',
      callId: `revoke-api-key-${confirmation.id}`,
      phase: 'confirmed',
      state: 'done',
    })
    assert.notProperty(assistantMessage.runtimeDetails[0], 'message')
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

  test('streams action progress and appends the result to the original assistant message', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Streaming confirmation admin',
      email: `streaming-confirmation-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(user)
    const { apiKey, confirmation, conversation } = await createConfirmation(user)
    const pendingMessage = await AiChatMessage.findOrFail(confirmation.assistantMessageId)
    pendingMessage.runtimeDetails.push({
      kind: 'plan',
      steps: [
        { key: 'identify_target', state: 'done' },
        { key: 'prepare_action', state: 'done' },
        { key: 'await_confirmation', state: 'running', startedAt: Date.now() - 10 },
      ],
    })
    await pendingMessage.save()

    const response = await client
      .post(
        `/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${confirmation.id}/confirm/stream`
      )
      .bearerToken(token.value!.release())

    response.assertStatus(200)
    assert.include(response.header('content-type') ?? '', 'text/event-stream')
    const body = response.text()
    const doneEvent = body.split('event: done\n')[1]?.split('\n\n')[0]
    const statusEvents = body
      .split('\n\n')
      .filter((event) => event.startsWith('event: agent_status\n'))
      .map((event) => JSON.parse(event.split('\n')[1]!.replace(/^data: /, '')))
    assert.include(body, 'event: agent_status')
    assert.notInclude(body, 'event: assistant_segment_start')
    assert.include(body, 'event: delta')
    assert.include(body, 'event: done')
    assert.include(body, 'event: agent_plan')
    assert.include(body, 'API Key「')
    assert.include(body, '已吊销')
    assert.include(body, '"state":"running"')
    assert.include(body, '"state":"done"')
    assert.isBelow(body.indexOf('"state":"running"'), body.indexOf('"state":"done"'))
    assert.lengthOf(statusEvents, 2)
    assert.equal(statusEvents[0].callId, `revoke-api-key-${confirmation.id}`)
    assert.equal(statusEvents[1].callId, statusEvents[0].callId)
    const resultMessageId = JSON.parse(doneEvent!.replace(/^data: /, '')).message.id
    assert.equal(resultMessageId, confirmation.assistantMessageId)
    assert.lengthOf(
      await AiChatMessage.query()
        .where('conversation_id', conversation.id)
        .where('role', 'assistant'),
      1
    )
    const completedMessage = await AiChatMessage.findOrFail(confirmation.assistantMessageId)
    assert.include(completedMessage.content, '已吊销')
    const completedTool = completedMessage.runtimeDetails.find((item) => item.kind === 'tool')
    const completedPlan = completedMessage.runtimeDetails.find((item) => item.kind === 'plan')
    assert.isDefined(completedTool)
    assert.equal(completedTool?.phase, 'confirmed')
    assert.isDefined(completedPlan)
    if (completedPlan?.kind === 'plan') {
      assert.equal(completedPlan.steps[2]?.state, 'done')
      assert.isNumber(completedPlan.steps[2]?.durationMs)
    }
    assert.notInclude(
      completedMessage.runtimeDetails.map((item) => item.kind),
      'confirmation'
    )
    const revokedApiKey = await ApiKey.findOrFail(apiKey.id)
    const confirmedProposal = await AiAgentConfirmation.findOrFail(confirmation.id)
    assert.isNotNull(revokedApiKey.revokedAt)
    assert.equal(confirmedProposal.status, 'confirmed')
  })

  test('creates a user after confirmation and discloses the initial password once', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const memberRole = await Role.create({
      code: `agent-created-user-${Date.now()}`,
      name: 'Agent created user role',
    })
    const actor = await User.create({
      fullName: 'User creation administrator',
      email: `user-creation-admin-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await actor.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(actor)
    const conversation = await AiChatConversation.create({
      userId: actor.id,
      title: 'Create managed user',
    })
    const email = `created-by-agent-${Date.now()}@example.com`
    const agentRunId = crypto.randomUUID()
    const proposal = await proposeAiAgentAction({
      action: 'create_user',
      actionInput: { fullName: 'Created by Agent', email, roleIds: [memberRole.id] },
      conversationId: conversation.id,
      userId: actor.id,
      agentRunId,
    })
    const assistantMessage = await AiChatMessage.create({
      conversationId: conversation.id,
      role: 'assistant',
      content: '请确认创建用户。',
      runtimeDetails: [
        {
          kind: 'tool',
          name: 'system_management_change',
          state: 'done',
          callId: 'create-user-call',
          phase: 'awaiting_confirmation',
          detail: { action: 'create_user', confirmationId: proposal.id },
        },
      ],
    })
    const attached = await attachAgentRunConfirmations({
      conversationId: conversation.id,
      userId: actor.id,
      agentRunId,
      assistantMessageId: assistantMessage.id,
    })
    assert.lengthOf(attached, 1)

    const response = await client
      .post(
        `/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${proposal.id}/confirm/stream`
      )
      .bearerToken(token.value!.release())

    response.assertStatus(200)
    const body = response.text()
    const credentialEvents = body
      .split('\n\n')
      .filter((event) => event.startsWith('event: credential_disclosure\n'))
    assert.lengthOf(credentialEvents, 1)
    const credentialPayload = JSON.parse(
      credentialEvents[0]!.split('\n')[1]!.replace(/^data: /, '')
    ) as { credential: { kind: string; value: string; label: string } }
    assert.equal(credentialPayload.credential.kind, 'password')
    assert.equal(credentialPayload.credential.label, email)

    const createdUser = await User.query().where('email', email).preload('roles').firstOrFail()
    assert.deepEqual(
      createdUser.roles.map((role) => role.id),
      [memberRole.id]
    )
    const completedMessage = await AiChatMessage.findOrFail(assistantMessage.id)
    assert.include(completedMessage.content, '初始密码已通过当前网页会话的一次性安全消息展示')
    assert.notInclude(completedMessage.content, credentialPayload.credential.value)
    const completedConfirmation = await AiAgentConfirmation.findOrFail(proposal.id)
    assert.notProperty(completedConfirmation.payload, 'password')
    assert.exists(
      await AuditLog.query()
        .where('action', 'user.created')
        .where('target_id', createdUser.id)
        .first()
    )
  })

  test('returns direct user credentials only through the secure disclosure callback', async ({
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const memberRole = await Role.create({
      code: `agent-direct-user-${Date.now()}`,
      name: 'Agent direct user role',
    })
    const actor = await User.create({
      fullName: 'Direct user creation administrator',
      email: `direct-user-admin-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await actor.related('roles').sync([superAdminRole.id])
    const email = `direct-created-by-agent-${Date.now()}@example.com`
    let disclosed: { kind: string; value: string; label: string } | undefined
    const ctx = {
      auth: { getUserOrFail: () => actor },
      request: {},
    } as unknown as import('@adonisjs/core/http').HttpContext

    const result = await executeAiAgentActionImmediately({
      action: 'create_user',
      actionInput: { fullName: 'Directly Created by Agent', email, roleIds: [memberRole.id] },
      ctx,
      onCredentialDisclosure: (credential) => {
        disclosed = credential
      },
    })

    const createdUser = await User.findBy('email', email)
    assert.deepEqual(result, {
      userId: createdUser?.id,
      credentialCreated: { kind: 'password', label: email },
    })
    assert.equal(disclosed?.kind, 'password')
    assert.equal(disclosed?.label, email)
    assert.isString(disclosed?.value)
    assert.notInclude(JSON.stringify(result), disclosed!.value)
  })

  test('ends the confirmation activity when a streamed proposal has expired', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Expired streaming confirmation admin',
      email: `expired-stream-confirmation-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(user)
    const { confirmation, conversation } = await createConfirmation(user)
    confirmation.expiresAt = DateTime.now().minus({ minutes: 1 })
    await confirmation.save()

    const response = await client
      .post(
        `/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${confirmation.id}/confirm/stream`
      )
      .bearerToken(token.value!.release())

    response.assertStatus(200)
    const body = response.text()
    assert.include(body, '"state":"running"')
    assert.include(body, '"state":"error"')
    assert.include(body, 'event: error')
    const expiredMessage = await AiChatMessage.findOrFail(confirmation.assistantMessageId)
    assert.deepInclude(expiredMessage.runtimeDetails[0], {
      kind: 'tool',
      state: 'error',
      phase: 'expired',
      message: '确认请求已过期，请重新发起',
    })
  })

  test('rechecks API Key delete permission when a user confirms', async ({ client, assert }) => {
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
    const revokedApiKey = await ApiKey.findOrFail(apiKey.id)
    const confirmedRequest = await AiAgentConfirmation.findOrFail(confirmation.id)
    assert.isNull(revokedApiKey.revokedAt)
    assert.equal(confirmedRequest.status, 'pending')
    assert.isNull(confirmedRequest.executionToken)
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

  test('serializes concurrent admin disable operations and keeps an enabled super-admin', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const firstAdmin = await User.create({
      fullName: 'First active admin',
      email: `first-active-admin-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const secondAdmin = await User.create({
      fullName: 'Second active admin',
      email: `second-active-admin-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await firstAdmin.related('roles').sync([superAdminRole.id])
    await secondAdmin.related('roles').sync([superAdminRole.id])
    const firstToken = await User.accessTokens.create(firstAdmin)
    const secondToken = await User.accessTokens.create(secondAdmin)
    const firstProposal = await createDisableUserConfirmation(firstAdmin, secondAdmin)
    const secondProposal = await createDisableUserConfirmation(secondAdmin, firstAdmin)
    const endpoint = (proposal: Awaited<ReturnType<typeof createDisableUserConfirmation>>) =>
      `/api/v1/ai-chat/conversations/${proposal.conversation.id}/confirmations/${proposal.confirmation.id}/confirm`

    const responses = await Promise.all([
      client.post(endpoint(firstProposal)).bearerToken(firstToken.value!.release()),
      client.post(endpoint(secondProposal)).bearerToken(secondToken.value!.release()),
    ])

    assert.isTrue(responses.some((response) => response.status() === 200))
    const enabledAdmins = await User.query()
      .whereNull('disabled_at')
      .whereHas('roles', (roles) => roles.where('roles.id', superAdminRole.id))
    assert.isAtLeast(enabledAdmins.length, 1)
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
    }).find((tool) => tool.name === 'revoke_api_key')

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
    }).find((tool) => tool.name === 'revoke_api_key')

    const output = await executeTool(proposalTool!, {
      name: apiKey.name,
    })

    const content = JSON.parse(String(output))
    assert.equal(content.action, 'revoke_api_key', JSON.stringify(content))
    assert.equal(content.targetId, String(apiKey.id))
  })

  test('returns a safe summary without exposing payload or fabricating a target ID', async ({
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
    confirmation.targetId = null
    confirmation.targetSummary = null
    await confirmation.save()

    const response = await client
      .get(`/api/v1/ai-chat/conversations/${conversation.id}`)
      .bearerToken(token.value!.release())

    response.assertStatus(200)
    const confirmationSummary = response.body().data.confirmations[0]
    assert.equal(confirmationSummary.impact, 'destructive')
    assert.deepEqual(confirmationSummary.changeSummary, [{ field: 'result', value: 'revoked' }])
    assert.notProperty(confirmationSummary, 'payload')
    assert.equal(confirmationSummary.id, confirmation.id)
    assert.isNull(confirmationSummary.targetId)
    assert.isNull(confirmationSummary.presentation.targetLabel)
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
    }).find((tool) => tool.name === 'delete_api_key')

    const output = await executeTool(proposalTool!, {
      name: apiKey.name,
    })

    const content = JSON.parse(String(output))
    assert.equal(content.action, 'delete_api_key', JSON.stringify(content))
    assert.equal(content.targetId, String(apiKey.id))
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
    }).find((tool) => tool.name === 'delete_api_key')

    const output = await executeTool(proposalTool!, {
      apiKeyId: apiKey.id,
    })

    assert.deepEqual(JSON.parse(String(output)), {
      kind: 'action_error',
      code: 'failed',
      message: '仅已吊销的 API Key 可被删除，请改用 revoke_api_key 操作',
    })
  })

  test('does not create an API Key deletion proposal without the delete permission', async ({
    assert,
  }) => {
    const user = await User.create({
      fullName: 'Deletion proposal reader',
      email: `deletion-proposal-reader-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Delete key without RBAC',
    })
    const error = await proposeAiAgentAction({
      action: 'delete_api_key',
      actionInput: { apiKeyId: 1 },
      conversationId: conversation.id,
      userId: user.id,
      agentRunId: crypto.randomUUID(),
    }).catch((caught: unknown) => caught)

    assert.instanceOf(error, AiAgentConfirmationError)
    assert.equal((error as AiAgentConfirmationError).status, 403)
    assert.isNull(await AiAgentConfirmation.query().where('requested_by_user_id', user.id).first())
  })

  test('confirms deleting a revoked API Key for an authorized conversation owner', async ({
    client,
    assert,
  }) => {
    const user = await User.create({
      fullName: 'Deletion confirmation admin',
      email: `deletion-confirmation-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
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

  test('cancels an API Key creation proposal without creating the key', async ({
    client,
    assert,
  }) => {
    const user = await User.create({
      fullName: 'Confirmation cancellation user',
      email: `confirmation-cancel-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const token = await User.accessTokens.create(user)
    const otherUser = await User.create({
      fullName: 'Other confirmation owner',
      email: `confirmation-cancel-other-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const otherToken = await User.accessTokens.create(otherUser)
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Cancel API Key creation',
    })
    const message = await AiChatMessage.create({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'A confirmation is required.',
      runtimeDetails: [
        {
          kind: 'tool',
          name: 'create_api_key',
          state: 'done',
          callId: 'create-api-key-call',
          phase: 'awaiting_confirmation',
          detail: { action: 'create_api_key' },
        },
      ],
    })
    const name = `Browser-qa-cancelled-${Date.now()}`
    const confirmation = await AiAgentConfirmation.create({
      conversationId: conversation.id,
      assistantMessageId: message.id,
      requestedByUserId: user.id,
      agentRunId: crypto.randomUUID(),
      action: 'create_api_key',
      targetType: 'api_key',
      targetId: null,
      targetSummary: { name },
      payload: { name, expiresAt: null },
      status: 'pending',
      expiresAt: DateTime.now().plus({ minutes: 5 }),
    })
    message.runtimeDetails = [
      {
        kind: 'tool',
        name: 'create_api_key',
        state: 'done',
        callId: 'create-api-key-call',
        phase: 'awaiting_confirmation',
        detail: { action: confirmation.action, confirmationId: confirmation.id },
      },
    ]
    await message.save()
    const path = `/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${confirmation.id}/cancel`

    const denied = await client.post(path).bearerToken(otherToken.value!.release())
    denied.assertStatus(404)
    const pendingProposal = await AiAgentConfirmation.findOrFail(confirmation.id)
    assert.equal(pendingProposal.status, 'pending')

    const response = await client.post(path).bearerToken(token.value!.release())
    response.assertStatus(200)
    const responseData = response.body() as {
      data: { presentation: { summary: string } }
    }
    assert.equal(responseData.data.presentation.summary, '操作已取消，未执行。')
    const cancelledProposal = await AiAgentConfirmation.findOrFail(confirmation.id)
    assert.equal(cancelledProposal.status, 'cancelled')
    assert.isNull(await ApiKey.query().where('name', name).first())
    const cancelledMessage = await AiChatMessage.findOrFail(message.id)
    assert.lengthOf(cancelledMessage.runtimeDetails, 1)
    assert.deepInclude(cancelledMessage.runtimeDetails[0], {
      kind: 'tool',
      phase: 'cancelled',
      callId: 'create-api-key-call',
    })
    const cancellationAudit = await AuditLog.query()
      .where('action', 'agent.proposal_cancelled')
      .where('target_type', 'api_key')
      .whereRaw("metadata->>'confirmationId' = ?", [String(confirmation.id)])
      .first()
    assert.exists(cancellationAudit)
    assert.deepInclude(cancellationAudit!.metadata, {
      confirmationId: confirmation.id,
      source: 'api',
    })

    const confirmAfterCancel = await client
      .post(
        `/api/v1/ai-chat/conversations/${conversation.id}/confirmations/${confirmation.id}/confirm`
      )
      .bearerToken(token.value!.release())
    confirmAfterCancel.assertStatus(409)
    assert.isNull(await ApiKey.query().where('name', name).first())
  })

  test('does not create an API Key revocation proposal without RBAC grants', async ({ assert }) => {
    const user = await User.create({
      fullName: 'Proposal reader',
      email: `proposal-reader-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Revoke key without RBAC',
    })
    const error = await proposeAiAgentAction({
      action: 'revoke_api_key',
      actionInput: { apiKeyId: 1 },
      conversationId: conversation.id,
      userId: user.id,
      agentRunId: crypto.randomUUID(),
    }).catch((caught: unknown) => caught)

    assert.instanceOf(error, AiAgentConfirmationError)
    assert.equal((error as AiAgentConfirmationError).status, 403)
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

  test('requires both send permission and confirmation for WeCom message delivery', async ({
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
    const readerConversation = await AiChatConversation.create({
      userId: reader.id,
      title: 'WeCom send without permission',
    })
    const denied = await proposeAiAgentAction({
      action: 'send_wecom_message',
      actionInput: { templateId: template.id, params: { content: '不应发送' } },
      conversationId: readerConversation.id,
      userId: reader.id,
      agentRunId: crypto.randomUUID(),
    }).catch((error: unknown) => error)
    assert.instanceOf(denied, AiAgentConfirmationError)
    assert.equal((denied as AiAgentConfirmationError).status, 403)
    assert.isNull(
      await AiAgentConfirmation.query().where('requested_by_user_id', reader.id).first()
    )

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
    }).find((tool) => tool.name === 'send_wecom_message')
    const proposal = JSON.parse(
      String(
        await executeTool(proposalTool!, {
          templateId: template.id,
          params: { content: '业务内容' },
          mentionedList: ['zhangsan'],
        })
      )
    )
    assert.notInclude(JSON.stringify(proposal), '业务内容')
    assert.include(JSON.stringify(proposal), 'content')
    const stored = await AiAgentConfirmation.findOrFail(proposal.id)
    assert.equal(stored.status, 'pending')
    assert.notInclude(JSON.stringify(stored.payload), '业务内容')
  })
})

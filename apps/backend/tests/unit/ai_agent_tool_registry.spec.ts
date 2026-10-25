import { test } from '@japa/runner'

import {
  createAiAgentTools,
  createConfiguredAiAgentTools,
} from '#ai/registry/ai_agent_tool_registry'

test.group('AI agent tool registry', () => {
  test('registers every Pi tool with an explicit name and description', ({ assert }) => {
    const tools = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    })

    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        'diagnose_my_access',
        'run_registered_query',
        'search_knowledge_catalog',
        'search_knowledge',
        'list_agent_skills',
        'load_agent_skill',
        'revoke_api_key',
        'delete_api_key',
        'system_management_change',
        'create_api_key',
        'send_wecom_message',
      ]
    )
    for (const tool of tools) {
      assert.isString(tool.description)
      assert.isAbove(tool.description.length, 20)
    }
  })

  test('keeps overall permission reviews separate from one-permission checks', ({ assert }) => {
    const diagnosticTool = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    }).find((registeredTool) => registeredTool.name === 'diagnose_my_access')

    if (!diagnosticTool) throw new Error('Expected access diagnostic tool')

    assert.include(diagnosticTool.description, 'overall permission review')
    assert.include(diagnosticTool.description, 'omit permissionCode')
    assert.include(
      diagnosticTool.description,
      'explicitly asks whether they have one named permission'
    )
  })

  test('distinguishes registered query tools from their template codes', ({ assert }) => {
    const queryTool = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    }).find((registeredTool) => registeredTool.name === 'run_registered_query')

    if (!queryTool) throw new Error('Expected registered query tool')
    assert.include(queryTool.description, 'The only tool for current system data')
    assert.include(
      queryTool.description,
      'Template codes, including api_key_profile, are values for its templateCode argument'
    )
    assert.include(queryTool.description, 'never call a template code as a separate tool')
    assert.include(queryTool.description, 'not a lookup for one named key')
    assert.include(queryTool.description, 'pass the exact name under params.name')
    assert.include(queryTool.description, 'leaving apiKeyId/id unset')
    assert.include(queryTool.description, 'use revoked_api_keys to list deletion candidates')
    assert.include(queryTool.description, 'never conclude a revoked key does not exist')
  })

  test('exposes only public knowledge search in visitor mode', ({ assert }) => {
    const tools = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'visitor-run',
      capabilityMode: 'knowledge-only',
    })

    assert.deepEqual(
      tools.map((tool) => tool.name),
      ['search_knowledge_catalog', 'search_knowledge']
    )
    for (const tool of tools) assert.equal(tool.executionMode, 'sequential')
  })

  test('keeps one-time credential operations in the web assistant only', async ({ assert }) => {
    const tools = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'channel-run',
      capabilityMode: 'channel',
    })
    assert.notInclude(
      tools.map(({ name }) => name),
      'create_api_key'
    )

    const managementTool = tools.find(({ name }) => name === 'system_management_change')
    if (!managementTool) throw new Error('Expected channel system management tool')
    assert.include(
      managementTool.description,
      'Password reset and user creation are available only in the web assistant'
    )
    const result = await managementTool.execute('channel-password-reset', {
      action: 'reset_user_password',
      input: { userId: 1 },
    })
    assert.equal((result.details as { kind: string }).kind, 'action_error')
    assert.equal((result.details as { code: string }).code, 'invalid_input')
  })

  test('exposes only administrator-enabled built-in tools', ({ assert }) => {
    const tools = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
      enabledToolNames: ['search_knowledge', 'load_agent_skill'],
    })

    assert.deepEqual(
      tools.map((tool) => tool.name),
      ['search_knowledge', 'load_agent_skill']
    )
  })

  test('supports a tool-free assistant turn for confirmed MCP result summaries', async ({
    assert,
  }) => {
    const tools = await createConfiguredAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'mcp-summary-run',
      enabledToolNames: [],
    })

    assert.deepEqual(tools, [])
  })

  test('documents the configured execution policy for API Key creation', ({ assert }) => {
    const tool = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    }).find((registeredTool) => registeredTool.name === 'create_api_key')

    if (!tool) throw new Error('Expected API Key creation tool')
    assert.include(tool.description, 'direct fields')
    assert.include(tool.description, 'configured execution policy')
    assert.include(tool.description, 'confirmation card')
    assert.include(tool.description, 'name')
    assert.notInclude(tool.description, 'input.name')
  })

  test('uses the exact requested name when deleting a revoked API Key', ({ assert }) => {
    const tool = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    }).find((registeredTool) => registeredTool.name === 'delete_api_key')

    if (!tool) throw new Error('Expected API Key deletion tool')
    assert.include(tool.description, 'templateCode revoked_api_keys')
    assert.include(tool.description, 'call this tool with that exact name')
    assert.include(tool.description, 'Never substitute a similarly named key')
  })

  test('passes an exact API Key target directly to the revocation tool', ({ assert }) => {
    const tool = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    }).find((registeredTool) => registeredTool.name === 'revoke_api_key')

    if (!tool) throw new Error('Expected API Key revocation tool')
    assert.include(tool.description, 'pass that target directly')
    assert.include(tool.description, 'Do not substitute a similar key')
    assert.include(tool.description, 'before the configured execution policy runs')
  })

  test('documents the generic management change input shape', ({ assert }) => {
    const tool = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    }).find((registeredTool) => registeredTool.name === 'system_management_change')

    if (!tool) throw new Error('Expected system management change tool')
    assert.include(tool.description, 'direct top-level fields')
    assert.include(tool.description, 'action create_role')
    assert.include(tool.description, 'fields code and name')
    assert.include(tool.description, 'create_user requires fullName, email, and roleIds')
  })

  test('runs all registered tools sequentially', ({ assert }) => {
    const tools = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    })

    for (const tool of tools) {
      assert.equal(tool.executionMode, 'sequential')
      assert.isObject(tool.parameters)
    }
  })

  test('rejects an already-aborted tool call before executing business logic', async ({
    assert,
  }) => {
    const tool = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    }).find((registeredTool) => registeredTool.name === 'diagnose_my_access')

    if (!tool) throw new Error('Expected access diagnostic tool')
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(() => tool.execute('test-call', {}, controller.signal), /cancelled/)
  })
})

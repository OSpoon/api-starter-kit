import { test } from '@japa/runner'

import { createAiAgentTools } from '#ai/registry/ai_agent_tool_registry'

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
        'search_knowledge',
        'propose_api_key_revocation',
        'propose_api_key_deletion',
        'propose_system_management_change',
        'propose_api_key_creation',
        'propose_wecom_message_send',
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

  test('exposes only public knowledge search in visitor mode', ({ assert }) => {
    const tools = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'visitor-run',
      capabilityMode: 'knowledge-only',
    })

    assert.deepEqual(
      tools.map((tool) => tool.name),
      ['search_knowledge']
    )
  })

  test('documents direct fields for API Key creation', ({ assert }) => {
    const tool = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    }).find((registeredTool) => registeredTool.name === 'propose_api_key_creation')

    if (!tool) throw new Error('Expected API Key creation tool')
    assert.include(tool.description, 'direct fields')
    assert.include(tool.description, 'call this tool before replying')
    assert.include(tool.description, 'never claim that a proposal')
    assert.include(tool.description, 'name')
    assert.notInclude(tool.description, 'input.name')
  })

  test('documents the generic management proposal input shape', ({ assert }) => {
    const tool = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    }).find((registeredTool) => registeredTool.name === 'propose_system_management_change')

    if (!tool) throw new Error('Expected system management proposal tool')
    assert.include(tool.description, 'direct top-level fields')
    assert.include(tool.description, 'action create_role')
    assert.include(tool.description, 'code, name')
  })

  test('uses parallel execution only for read-only tools', ({ assert }) => {
    const tools = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    })

    for (const name of ['diagnose_my_access', 'run_registered_query', 'search_knowledge']) {
      assert.equal(tools.find((tool) => tool.name === name)?.executionMode, 'parallel')
    }
    for (const tool of tools.filter((candidate) => candidate.name.startsWith('propose_'))) {
      assert.equal(tool.executionMode, 'sequential')
    }
    for (const tool of tools) assert.isObject(tool.parameters)
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

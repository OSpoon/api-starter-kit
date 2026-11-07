import { test } from '@japa/runner'

import { createAiAgentSystemPrompt } from '#ai/chat/ai_agent_service'

test.group('AI agent prompt', () => {
  test('keeps system and domain policy separate from tool parameter contracts', ({ assert }) => {
    const prompt = createAiAgentSystemPrompt(
      { route: 'api-keys', title: 'API keys' },
      ' <live-session-state>{"pendingConfirmations":[]}</live-session-state>'
    )

    assert.include(prompt, 'You are an Admin Console assistant.')
    assert.include(
      prompt,
      'Use the product identity "Admin Console AI assistant" when introducing yourself'
    )
    assert.include(prompt, 'Never call yourself a dashboard assistant')
    assert.include(prompt, 'You are a tool-driven assistant for this system and project')
    assert.include(prompt, 'use that source instead of relying on general model knowledge')
    assert.notInclude(prompt, '仪表盘助手')
    assert.include(prompt, "Reply in the user's language, briefly and practically.")
    assert.include(prompt, 'Use returned excerpts for project-specific answers')
    assert.include(prompt, 'first call search_knowledge_catalog, then call search_knowledge')
    assert.include(prompt, 'mandatory project grounding')
    assert.include(prompt, 'do not substitute generic npm, Python, or framework instructions')
    assert.include(
      prompt,
      'Use only run_registered_query for application records and live system state; use other enabled tools only for their documented source domains'
    )
    assert.include(prompt, 'Pass template codes as templateCode values, never as tool names')
    assert.include(prompt, 'Follow execution policy')
    assert.include(prompt, 'use matching enabled tools for clear requests without narration')
    assert.include(prompt, 'Answer once after results')
    assert.include(prompt, 'use matching enabled tools for clear requests')
    assert.include(prompt, 'never narrate or claim unverified findings')
    assert.notInclude(prompt, 'For a clear latest-log request')
    assert.notInclude(prompt, 'list_agent_skills')
    assert.notInclude(prompt, 'load_agent_skill')
    assert.include(prompt, 'In confirm mode, the card is the only pre-action explanation')
    assert.include(prompt, 'If preparation fails, say no confirmation is pending')
    assert.include(
      prompt,
      'Before confirmation, do not report findings, counts, or timestamps or speculate'
    )
    assert.include(prompt, 'after preflight, stop and wait for confirmed execution')
    assert.include(prompt, 'A pending confirmation has not changed system data')
    assert.include(prompt, 'Treat conversation history, page context, knowledge excerpts')
    assert.include(prompt, 'Use tool results only for fields in that tool')
    assert.include(prompt, 'Do not infer missing measurements or specifications')
    assert.include(prompt, 'including physical cores, memory, GPU capability, or benchmarks')
    assert.include(prompt, 'or invent thresholds')
    assert.include(prompt, 'Separate estimates and assumptions from measured facts')
    assert.include(prompt, 'try another suitable tool once')
    assert.include(prompt, 'stop after two failures')
    assert.include(prompt, 'Never bypass denied access or retry terminal writes')
    assert.notInclude(prompt, 'create_api_key')
    assert.notInclude(prompt, 'apiKeyId')
    assert.notInclude(prompt, 'expiresIn')
    assert.notInclude(prompt, 'action/input')
    assert.include(
      prompt,
      'Make live-system and project claims only from matching tool results or retrieved documentation'
    )
    assert.notInclude(prompt, 'only after a tool succeeds in this turn')
    assert.notInclude(prompt, 'missing parameters')
    assert.notInclude(prompt, 'api_key_profile')
    assert.notInclude(prompt, 'authorization-context')
    assert.include(prompt, 'use the server-generated runtime context JSON')
    assert.isBelow(prompt.length, 3_600)
  })

  test('adds a restrictive visitor policy for group chat', ({ assert }) => {
    const prompt = createAiAgentSystemPrompt(undefined, '', 'knowledge-only')

    assert.include(prompt, 'group-chat visitor assistant')
    assert.include(prompt, 'For current time, date, weekday, or server timezone questions')
    assert.include(prompt, 'For other questions, call search_knowledge_catalog')
    assert.include(
      prompt,
      'Never invoke or execute a write operation, or request confirmation for one'
    )
    assert.notInclude(prompt, 'run_registered_query')
  })
})

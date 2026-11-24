import { test } from '@japa/runner'

import { getAiAgentMentionedSkills, shouldStopAgentAfterTurn } from '#ai/runtime/ai_agent_runtime'

test.group('AI agent runtime policy', () => {
  test('resolves only explicitly mentioned enabled skills', ({ assert }) => {
    const skills = [
      { code: 'archify', name: 'Archify', description: 'Build diagrams.' },
      { code: 'review', name: 'Review', description: 'Review changes.' },
    ]

    assert.deepEqual(getAiAgentMentionedSkills('Use @review for this. @missing later.', skills), [
      skills[1],
    ])
    assert.deepEqual(getAiAgentMentionedSkills('mail me@example.com', skills), [])
  })

  test('stops after provider failures or aborts', ({ assert }) => {
    assert.isTrue(
      shouldStopAgentAfterTurn({ stopReason: 'error', toolResults: [], hasQueuedMessages: false })
    )
    assert.isTrue(
      shouldStopAgentAfterTurn({ stopReason: 'aborted', toolResults: [], hasQueuedMessages: false })
    )
  })

  test('stops after terminal tool results but continues when no tools ran', ({ assert }) => {
    assert.isTrue(
      shouldStopAgentAfterTurn({
        stopReason: 'stop',
        toolResults: [{ toolName: 'system_management_change', details: { kind: 'action_error' } }],
        hasQueuedMessages: false,
      })
    )
    assert.isFalse(
      shouldStopAgentAfterTurn({ stopReason: 'stop', toolResults: [], hasQueuedMessages: false })
    )
  })

  test('lets queued requests continue after terminal tool results', ({ assert }) => {
    assert.isFalse(
      shouldStopAgentAfterTurn({
        stopReason: 'stop',
        toolResults: [{ toolName: 'system_management_change', details: { kind: 'action_error' } }],
        hasQueuedMessages: true,
      })
    )
  })

  test('continues mixed batches when only a confirmation result is terminal', ({ assert }) => {
    assert.isFalse(
      shouldStopAgentAfterTurn({
        stopReason: 'stop',
        toolResults: [
          { toolName: 'system_management_change', details: { kind: 'action_result' } },
          { toolName: 'system_management_change', details: { kind: 'action_error' } },
        ],
        hasQueuedMessages: false,
      })
    )
  })

  test('continues after recoverable read errors and stops on denied or exhausted reads', ({
    assert,
  }) => {
    assert.isFalse(
      shouldStopAgentAfterTurn({
        stopReason: 'stop',
        toolResults: [
          { toolName: 'run_registered_query', details: { kind: 'query_error', code: 'failed' } },
        ],
        hasQueuedMessages: false,
      })
    )
    assert.isTrue(
      shouldStopAgentAfterTurn({
        stopReason: 'stop',
        toolResults: [
          {
            toolName: 'run_registered_query',
            details: { kind: 'query_error', code: 'permission_denied' },
          },
        ],
        hasQueuedMessages: false,
      })
    )
    assert.isTrue(
      shouldStopAgentAfterTurn(
        { stopReason: 'stop', toolResults: [], hasQueuedMessages: false },
        true
      )
    )
  })
})

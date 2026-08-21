import { test } from '@japa/runner'

import {
  getAiAgentRun,
  registerAiAgentRun,
  releaseAiAgentRun,
} from '#ai/runtime/ai_agent_run_registry'

test.group('AI agent run registry', () => {
  test('isolates active Pi controls by conversation and user', ({ assert }) => {
    const firstControl = {
      steer: () => undefined,
      followUp: () => undefined,
      abort: () => undefined,
    }
    const secondControl = {
      steer: () => undefined,
      followUp: () => undefined,
      abort: () => undefined,
    }

    registerAiAgentRun({
      conversationId: 11,
      userId: 7,
      agentRunId: 'run-1',
      control: firstControl,
    })
    registerAiAgentRun({
      conversationId: 11,
      userId: 8,
      agentRunId: 'run-2',
      control: secondControl,
    })

    assert.equal(getAiAgentRun(11, 7)?.agentRunId, 'run-1')
    assert.equal(getAiAgentRun(11, 8)?.agentRunId, 'run-2')

    releaseAiAgentRun(11, 7, 'wrong-run')
    assert.equal(getAiAgentRun(11, 7)?.agentRunId, 'run-1')
    releaseAiAgentRun(11, 7, 'run-1')
    assert.isUndefined(getAiAgentRun(11, 7))
    assert.equal(getAiAgentRun(11, 8)?.agentRunId, 'run-2')

    releaseAiAgentRun(11, 8, 'run-2')
  })
})

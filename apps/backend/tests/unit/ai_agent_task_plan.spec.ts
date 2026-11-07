import { test } from '@japa/runner'

import type { AiAgentTaskPlanStep } from '#ai/core/ai_agent_tool_context'
import { createAiAgentToolSupport } from '#ai/registry/ai_agent_tool_helpers'
import { createAiAgentTaskPlanTool } from '#ai/tools/update_task_plan'

test.group('AI agent task plan tool', () => {
  test('publishes labeled steps as plan metadata', async ({ assert }) => {
    let updatedSteps: AiAgentTaskPlanStep[] | undefined
    const context = {
      userId: 1,
      conversationId: 1,
      agentRunId: 'plan-run',
      onTaskPlanUpdate: (steps: AiAgentTaskPlanStep[]) => {
        updatedSteps = steps
      },
    }
    const tool = createAiAgentTaskPlanTool(context, createAiAgentToolSupport(context))
    const result = await tool.execute('plan-call', {
      steps: [
        { label: 'Read the source', state: 'done' },
        { label: 'Verify the behavior', state: 'running' },
      ],
    })

    assert.equal(tool.name, 'update_task_plan')
    assert.deepEqual(updatedSteps, [
      { key: 'task_step_1', label: 'Read the source', state: 'done' },
      { key: 'task_step_2', label: 'Verify the behavior', state: 'running' },
    ])
    assert.deepEqual(result.details, { kind: 'task_plan_updated', steps: updatedSteps })
  })
})

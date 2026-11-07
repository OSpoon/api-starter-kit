import { z } from 'zod'

import type { AiAgentTaskPlanStep, AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { type AiAgentToolSupport, createAiAgentTool } from '#ai/registry/ai_agent_tool_helpers'
import { piToolParameters } from '#ai/registry/ai_agent_tool_parameters'

const planSchema = z.object({
  steps: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(240),
        state: z.enum(['pending', 'running', 'done']),
      })
    )
    .min(1)
    .max(8),
})

export function createAiAgentTaskPlanTool(input: AiAgentToolContext, support: AiAgentToolSupport) {
  return createAiAgentTool(
    async ({ steps }) => {
      support.throwIfAborted()
      const planSteps: AiAgentTaskPlanStep[] = steps.map((step, index) => ({
        key: `task_step_${index + 1}`,
        label: step.label,
        state: step.state,
      }))
      await input.onTaskPlanUpdate?.(planSteps)
      return { kind: 'task_plan_updated', steps: planSteps }
    },
    {
      name: 'update_task_plan',
      description:
        'Publish or update a concise progress plan for a complex multi-step task. Do not use for simple questions. Send the full current step list each time, mark only the active step running, and mark a step done only after its tool result or confirmed operation is complete. Plan status is display metadata and never proves that an operation succeeded.',
      schema: planSchema,
      parameters: piToolParameters.taskPlan,
      executionMode: 'sequential',
    }
  )
}

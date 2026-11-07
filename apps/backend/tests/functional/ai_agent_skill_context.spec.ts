import { test } from '@japa/runner'

import { loadAiAgentSkillRuntimeContext } from '#services/ai_agent_skill_context_service'

test.group('AI agent skill runtime context', () => {
  test('provides the service status snapshot when an enabled skill declares it', async ({
    assert,
  }) => {
    const context = await loadAiAgentSkillRuntimeContext(['system-status'])
    assert.isObject(context['system-status'])
    assert.property(context['system-status'] as object, 'disks')
    assert.deepEqual(await loadAiAgentSkillRuntimeContext([]), {})
  })
})

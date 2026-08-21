import { test } from '@japa/runner'

import { evaluateAiAssistantTurn } from '#ai/evaluation/ai_evaluation'

const evaluation = {
  question: 'test',
  expectedTools: ['search_knowledge'],
}

test.group('AI assistant evaluation', () => {
  test('passes when the exact expected tool set is called', ({ assert }) => {
    assert.deepEqual(
      evaluateAiAssistantTurn({
        evaluation,
        calledTools: ['search_knowledge'],
      }),
      { passed: true, toolsPassed: true }
    )
  })

  test('fails when an unexpected tool is called', ({ assert }) => {
    const result = evaluateAiAssistantTurn({
      evaluation: { ...evaluation, expectedTools: [] },
      calledTools: ['search_knowledge'],
    })

    assert.deepEqual(result, { passed: false, toolsPassed: false })
  })
})

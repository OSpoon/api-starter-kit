import { test } from '@japa/runner'

import { evaluateAiAssistantTurn } from '#services/ai_evaluation'

const evaluation = {
  question: 'test',
  expectedTools: ['search_knowledge'],
  expectedResponse: 'grounded' as const,
}

test.group('AI assistant evaluation', () => {
  test('passes only when the exact expected tool set and response guard match', ({ assert }) => {
    assert.deepEqual(
      evaluateAiAssistantTurn({
        evaluation,
        calledTools: ['search_knowledge'],
        rawContent: 'Grounded response',
        response: 'Grounded response',
      }),
      { passed: true, toolsPassed: true, responsePassed: true }
    )
  })

  test('fails when an unexpected tool is called or the scope guard is missing', ({ assert }) => {
    const result = evaluateAiAssistantTurn({
      evaluation: { ...evaluation, expectedTools: [], expectedResponse: 'scope' },
      calledTools: ['search_knowledge'],
      rawContent: 'Unsafe response',
      response: 'Unsafe response',
    })

    assert.deepEqual(result, { passed: false, toolsPassed: false, responsePassed: false })
  })
})

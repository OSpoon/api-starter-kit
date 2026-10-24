import { test } from '@japa/runner'

import { evaluateAiAssistantTurn } from '#ai/evaluation/ai_evaluation'

const evaluation = {
  question: 'test',
  expectedTools: ['search_knowledge_catalog', 'search_knowledge'],
}

test.group('AI assistant evaluation', () => {
  test('passes when the expected tool set is called', ({ assert }) => {
    assert.deepEqual(
      evaluateAiAssistantTurn({
        evaluation,
        calledTools: ['search_knowledge_catalog', 'search_knowledge'],
      }),
      { passed: true, toolsPassed: true, sequencePassed: true, answerPassed: true }
    )
  })

  test('fails when an unexpected tool is called', ({ assert }) => {
    const result = evaluateAiAssistantTurn({
      evaluation: { ...evaluation, expectedTools: [] },
      calledTools: ['search_knowledge_catalog', 'search_knowledge'],
    })

    assert.deepEqual(result, {
      passed: false,
      toolsPassed: false,
      sequencePassed: true,
      answerPassed: true,
    })
  })

  test('checks tool order and required answer evidence for fallback scenarios', ({ assert }) => {
    const fallbackEvaluation = {
      question: 'query failed; use knowledge base',
      expectedTools: ['run_registered_query', 'search_knowledge_catalog', 'search_knowledge'],
      expectedToolSequence: [
        'run_registered_query',
        'search_knowledge_catalog',
        'search_knowledge',
      ],
      expectedAnswerIncludes: ['RBAC', '无法确认'],
    }

    assert.isTrue(
      evaluateAiAssistantTurn({
        evaluation: fallbackEvaluation,
        calledTools: ['run_registered_query', 'search_knowledge_catalog', 'search_knowledge'],
        assistantText: 'RBAC 通过角色组合权限。当前权限无法确认。',
      }).passed
    )
    assert.isFalse(
      evaluateAiAssistantTurn({
        evaluation: fallbackEvaluation,
        calledTools: ['search_knowledge_catalog', 'search_knowledge', 'run_registered_query'],
        assistantText: 'RBAC 通过角色组合权限。当前权限无法确认。',
      }).passed
    )
    assert.isFalse(
      evaluateAiAssistantTurn({
        evaluation: fallbackEvaluation,
        calledTools: ['run_registered_query', 'search_knowledge_catalog', 'search_knowledge'],
        assistantText: '未找到相关信息。',
      }).passed
    )
  })
})

import { test } from '@japa/runner'

import { scoreAiEvaluationAnswer } from '#ai/evaluation/ai_evaluation'
import { redactEvaluationText } from '#services/ai_evaluation_service'

test.group('AI evaluation scoring', () => {
  test('scores tool use and explicit rubric checks', ({ assert }) => {
    const result = scoreAiEvaluationAnswer({
      expectedTools: ['search_logs'],
      expectedToolSequence: ['search_logs'],
      requiredTerms: ['backend', 'warn'],
      forbiddenTerms: ['password'],
      actualTools: ['search_logs'],
      answer: 'The backend has a warn entry.',
      referenceAnswer: 'The backend has a warn entry.',
    })

    assert.equal(result.score, 100)
    assert.isTrue(result.passed)
    assert.isTrue(result.toolsPassed)
  })

  test('uses a partial score when tool or answer checks fail', ({ assert }) => {
    const result = scoreAiEvaluationAnswer({
      expectedTools: [],
      requiredTerms: ['backend', 'missing'],
      forbiddenTerms: ['password'],
      actualTools: ['search_logs'],
      answer: 'backend output mentions password',
      referenceAnswer: 'The system returned normal service details.',
    })

    assert.isBelow(result.score, 70)
    assert.isFalse(result.passed)
    assert.isFalse(result.toolsPassed)
  })

  test('redacts common secrets and personal data before model use', ({ assert }) => {
    const redacted = redactEvaluationText(
      'contact person@example.com or 13800138000; token=secret-value and Bearer abc.def'
    )

    assert.notInclude(redacted, 'person@example.com')
    assert.notInclude(redacted, '13800138000')
    assert.notInclude(redacted, 'secret-value')
    assert.notInclude(redacted, 'abc.def')
  })
})

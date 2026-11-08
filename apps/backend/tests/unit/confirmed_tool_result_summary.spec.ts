import { test } from '@japa/runner'

import {
  createCancellationPrompt,
  createConfirmationBatchPrompt,
  shouldDeferConfirmationReply,
} from '#ai/chat/confirmed_tool_result_summary'

test.group('confirmed tool result summary', () => {
  test('defers a conclusion only while this assistant message has pending confirmations', ({
    assert,
  }) => {
    assert.isTrue(shouldDeferConfirmationReply([{ messageId: 12 }], 12))
    assert.isFalse(shouldDeferConfirmationReply([{ messageId: 13 }], 12))
    assert.isFalse(shouldDeferConfirmationReply([], 12))
  })

  test('records cancelled calls as unexecuted and tells the model not to repeat them', ({
    assert,
  }) => {
    const resolutions = [
      { action: 'call_builtin_tool', targetSummary: { toolName: 'run_registered_query' } },
    ]
    const prompt = createCancellationPrompt(resolutions)
    const batchPrompt = createConfirmationBatchPrompt(false, resolutions)

    assert.include(prompt, 'was not executed')
    assert.include(prompt, 'Do not repeat it')
    assert.include(prompt, 'run_registered_query')
    assert.include(batchPrompt, 'All user-confirmation decisions')
    assert.include(batchPrompt, 'Do not call tools')
  })
})

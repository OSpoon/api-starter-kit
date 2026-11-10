import { test } from '@japa/runner'

import { toPiToolParameters } from '#ai/agent/pi/tool_parameters'

test.group('Pi tool parameter adapter', () => {
  test('preserves the JSON Schema sent by the engine-neutral contract', ({ assert }) => {
    const parameters = {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 },
        page: { type: 'integer', minimum: 1 },
      },
      required: ['query'],
    } as const

    assert.deepEqual(JSON.parse(JSON.stringify(toPiToolParameters(parameters))), parameters)
  })
})

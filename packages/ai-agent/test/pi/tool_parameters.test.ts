import { describe, expect, it } from 'vitest'

import { toPiToolParameters } from '../../src/pi/tool_parameters.js'

describe('Pi tool parameter adapter', () => {
  it('preserves the JSON Schema sent by the engine-neutral contract', () => {
    const parameters = {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 },
        page: { type: 'integer', minimum: 1 },
      },
      required: ['query'],
    } as const

    expect(JSON.parse(JSON.stringify(toPiToolParameters(parameters)))).toEqual(parameters)
  })
})

import { test } from '@japa/runner'

import { calculateModelsDevCost, findModelsDevPricing } from '#services/models_dev_pricing_service'

test.group('models.dev pricing', () => {
  test('matches an exact provider model and calculates per-million-token cost', ({ assert }) => {
    const pricing = findModelsDevPricing(
      {
        openai: {
          models: {
            'openai/gpt-4o-mini': {
              id: 'openai/gpt-4o-mini',
              cost: { input: 0.15, output: 0.6, cache_read: 0.075 },
              last_updated: '2026-09-01',
            },
          },
        },
      },
      'openai/gpt-4o-mini'
    )

    assert.deepEqual(pricing, {
      modelId: 'openai/gpt-4o-mini',
      cost: { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0 },
      version: '2026-09-01',
    })
    assert.equal(
      calculateModelsDevCost(
        { input: 1_000_000, output: 500_000, cacheRead: 0, cacheWrite: 0 },
        pricing!.cost
      ),
      0.45
    )
  })

  test('does not guess when a short model name has multiple provider prices', ({ assert }) => {
    const pricing = findModelsDevPricing(
      {
        first: {
          models: {
            'first/private-model': {
              id: 'first/private-model',
              cost: { input: 1, output: 2 },
            },
          },
        },
        second: {
          models: {
            'second/private-model': {
              id: 'second/private-model',
              cost: { input: 3, output: 4 },
            },
          },
        },
      },
      'private-model'
    )

    assert.isNull(pricing)
  })

  test('scopes a short model name to the provider matching the Pi endpoint', ({ assert }) => {
    const pricing = findModelsDevPricing(
      {
        openai: {
          api: 'https://api.openai.com/v1',
          models: {
            'gpt-4o-mini': {
              id: 'gpt-4o-mini',
              cost: { input: 0.15, output: 0.6 },
            },
          },
        },
        private: {
          api: 'https://llm.internal.example/v1',
          models: {
            'gpt-4o-mini': {
              id: 'gpt-4o-mini',
              cost: { input: 0, output: 0 },
            },
          },
        },
      },
      'gpt-4o-mini',
      'https://api.openai.com/v1/'
    )

    assert.equal(pricing?.cost.input, 0.15)
    assert.equal(pricing?.cost.output, 0.6)
  })

  test('returns no price for a private model without a catalog entry', ({ assert }) => {
    const pricing = findModelsDevPricing({ openai: { models: {} } }, 'private/deployment')

    assert.isNull(pricing)
  })
})

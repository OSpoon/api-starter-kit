import { test } from '@japa/runner'

import {
  ReloadableAiChannelRuntime,
  type ReloadableBotRuntime,
} from '#channels/reloadable_ai_channel_runtime'
import type { ImConfigurationChangeListener } from '#services/im_configuration_change_listener'

class FakeListener implements ImConfigurationChangeListener {
  constructor(private readonly onChange: () => Promise<void>) {}

  async start() {}

  async stop() {}

  notify() {
    return this.onChange()
  }
}

class FakeRuntime implements ReloadableBotRuntime {
  constructor(
    readonly configurationKey: string,
    private readonly events: string[],
    private readonly startError = false
  ) {}

  async start() {
    this.events.push(`start:${this.configurationKey}`)
    if (this.startError) throw new Error(`start failed: ${this.configurationKey}`)
  }

  async stop() {
    this.events.push(`stop:${this.configurationKey}`)
  }
}

function createLogger() {
  return {
    errors: [] as string[],
    infos: [] as string[],
    error(message: string) {
      this.errors.push(message)
    },
    info(message: string) {
      this.infos.push(message)
    },
  }
}

test.group('Reloadable AI channel runtime', () => {
  test('starts a new runtime before stopping the previous runtime', async ({ assert }) => {
    const events: string[] = []
    const logger = createLogger()
    let version = 1
    let listener: FakeListener | null = null
    const runtime = new ReloadableAiChannelRuntime({
      name: 'Test',
      logger,
      createRuntime: async () => new FakeRuntime(String(version), events),
      createListener: (onChange) => {
        listener = new FakeListener(onChange)
        return listener
      },
      reconcileIntervalMs: 60 * 60 * 1000,
    })

    await runtime.start()
    version = 2
    await listener!.notify()
    await runtime.stop()

    assert.deepEqual(events, ['start:1', 'start:2', 'stop:1', 'stop:2'])
  })

  test('keeps the previous runtime when the replacement fails', async ({ assert }) => {
    const events: string[] = []
    const logger = createLogger()
    let attempt = 0
    let listener: FakeListener | null = null
    const runtime = new ReloadableAiChannelRuntime({
      name: 'Test',
      logger,
      createRuntime: async () => {
        attempt += 1
        return new FakeRuntime(String(attempt), events, attempt === 2)
      },
      createListener: (onChange) => {
        listener = new FakeListener(onChange)
        return listener
      },
      reconcileIntervalMs: 60 * 60 * 1000,
    })

    await runtime.start()
    await listener!.notify()
    await runtime.stop()

    assert.deepEqual(events, ['start:1', 'start:2', 'stop:2', 'stop:1'])
    assert.lengthOf(logger.errors, 1)
  })

  test('stops the active runtime when configuration becomes incomplete', async ({ assert }) => {
    const events: string[] = []
    const logger = createLogger()
    let configured = true
    let listener: FakeListener | null = null
    const runtime = new ReloadableAiChannelRuntime({
      name: 'Test',
      logger,
      createRuntime: async () => (configured ? new FakeRuntime('configured', events) : null),
      createListener: (onChange) => {
        listener = new FakeListener(onChange)
        return listener
      },
      reconcileIntervalMs: 60 * 60 * 1000,
    })

    await runtime.start()
    configured = false
    await listener!.notify()
    await runtime.stop()

    assert.deepEqual(events, ['start:configured', 'stop:configured'])
    assert.isEmpty(logger.errors)
  })
})

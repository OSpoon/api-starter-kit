import logger from '@adonisjs/core/services/logger'

import {
  type ImConfigurationChangeListener,
  PostgresImConfigurationChangeListener,
} from '#services/im_configuration_change_listener'

interface RuntimeLogger {
  child?(fields: Record<string, unknown>): RuntimeLogger
  error(fields: Record<string, unknown>, message: string): void
  info(fields: Record<string, unknown>, message: string): void
}

export interface ReloadableBotRuntime {
  readonly configurationKey?: string
  start(): Promise<void>
  stop(): Promise<void>
}

interface ReloadableAiChannelRuntimeOptions {
  name: string
  createRuntime: () => Promise<ReloadableBotRuntime | null>
  logger?: RuntimeLogger
  createListener?: (onChange: () => Promise<void>) => ImConfigurationChangeListener
  reconcileIntervalMs?: number
}

const RECONCILE_INTERVAL_MS = 30_000

/**
 * Keeps one channel worker alive while replacing its provider connection when
 * the persisted channel configuration changes.
 */
export class ReloadableAiChannelRuntime implements ReloadableBotRuntime {
  private readonly name: string
  private readonly createRuntime: ReloadableAiChannelRuntimeOptions['createRuntime']
  private readonly logger: RuntimeLogger
  private readonly createListener: NonNullable<ReloadableAiChannelRuntimeOptions['createListener']>
  private readonly reconcileIntervalMs: number
  private listener: ImConfigurationChangeListener | null = null
  private reconcileTimer: ReturnType<typeof setInterval> | null = null
  private activeRuntime: ReloadableBotRuntime | null = null
  private reloadPromise: Promise<void> | null = null
  private reloadRequested = false
  private started = false

  get configurationKey() {
    return this.activeRuntime?.configurationKey
  }

  constructor(options: ReloadableAiChannelRuntimeOptions) {
    this.name = options.name.toLowerCase()
    this.createRuntime = options.createRuntime
    const baseLogger = options.logger ?? logger
    this.logger = baseLogger.child?.({ channel: this.name }) ?? baseLogger
    this.createListener =
      options.createListener ??
      ((onChange) => new PostgresImConfigurationChangeListener({ onChange }))
    this.reconcileIntervalMs = options.reconcileIntervalMs ?? RECONCILE_INTERVAL_MS
  }

  async start() {
    if (this.started) return
    this.started = true
    this.listener = this.createListener(() => this.requestReload())
    await this.listener.start()
    await this.requestReload()
    this.reconcileTimer = setInterval(() => {
      void this.requestReload()
    }, this.reconcileIntervalMs)
    this.reconcileTimer.unref?.()
  }

  async stop() {
    if (!this.started) return
    this.started = false
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer)
      this.reconcileTimer = null
    }
    await this.listener?.stop()
    this.listener = null

    const inFlightReload = this.reloadPromise
    if (inFlightReload) await inFlightReload.catch(() => undefined)
    await this.stopActiveRuntime()
  }

  private requestReload() {
    if (!this.started) return Promise.resolve()
    this.reloadRequested = true
    if (!this.reloadPromise) {
      this.reloadPromise = this.processReloads().finally(() => {
        this.reloadPromise = null
        if (this.started && this.reloadRequested) void this.requestReload()
      })
    }
    return this.reloadPromise
  }

  private async processReloads() {
    while (this.started && this.reloadRequested) {
      this.reloadRequested = false
      await this.reloadOnce()
    }
  }

  private async reloadOnce() {
    let nextRuntime: ReloadableBotRuntime | null
    try {
      nextRuntime = await this.createRuntime()
    } catch (error) {
      this.logger.error(
        { err: error, operation: 'create_runtime' },
        'AI channel configuration reload failed'
      )
      return
    }

    if (!nextRuntime) {
      if (this.activeRuntime) {
        await this.stopActiveRuntime()
        this.logger.info({}, 'AI channel stopped because its configuration is incomplete')
      } else {
        this.logger.info({}, 'AI channel is waiting for complete IM configuration')
      }
      return
    }

    if (this.activeRuntime?.configurationKey === nextRuntime.configurationKey) {
      await nextRuntime.stop()
      return
    }

    try {
      await nextRuntime.start()
    } catch (error) {
      await nextRuntime.stop().catch(() => undefined)
      this.logger.error(
        {
          err: error,
          operation: 'start_replacement_runtime',
          keepingCurrentRuntime: Boolean(this.activeRuntime),
        },
        'AI channel replacement connection failed'
      )
      return
    }

    if (!this.started) {
      await nextRuntime.stop()
      return
    }

    const previousRuntime = this.activeRuntime
    this.activeRuntime = nextRuntime
    await previousRuntime?.stop().catch((error) => {
      this.logger.error(
        { err: error, operation: 'stop_previous_runtime' },
        'Previous AI channel connection shutdown failed'
      )
    })
    this.logger.info({}, 'AI channel connection reloaded successfully')
  }

  private async stopActiveRuntime() {
    const runtime = this.activeRuntime
    this.activeRuntime = null
    if (!runtime) return
    await runtime.stop().catch((error) => {
      this.logger.error(
        { err: error, operation: 'stop_active_runtime' },
        'AI channel shutdown failed'
      )
    })
  }
}

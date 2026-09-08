import {
  type ImConfigurationChangeListener,
  PostgresImConfigurationChangeListener,
} from '#services/im_configuration_change_listener'

interface RuntimeLogger {
  error(message: string): void
  info(message: string): void
}

export interface ReloadableBotRuntime {
  readonly configurationKey?: string
  start(): Promise<void>
  stop(): Promise<void>
}

interface ReloadableAiChannelRuntimeOptions {
  name: string
  createRuntime: () => Promise<ReloadableBotRuntime | null>
  logger: RuntimeLogger
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
    this.name = options.name
    this.createRuntime = options.createRuntime
    this.logger = options.logger
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
        `${this.name} bot configuration reload failed: ${error instanceof Error ? error.message : String(error)}`
      )
      return
    }

    if (!nextRuntime) {
      if (this.activeRuntime) {
        await this.stopActiveRuntime()
        this.logger.info(`${this.name} bot stopped because its configuration is incomplete`)
      } else {
        this.logger.info(`${this.name} bot is waiting for complete IM configuration`)
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
        `${this.name} bot new connection failed; keeping the current connection: ${error instanceof Error ? error.message : String(error)}`
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
        `${this.name} bot old connection shutdown failed: ${error instanceof Error ? error.message : String(error)}`
      )
    })
    this.logger.info(`${this.name} bot connection reloaded successfully`)
  }

  private async stopActiveRuntime() {
    const runtime = this.activeRuntime
    this.activeRuntime = null
    if (!runtime) return
    await runtime.stop().catch((error) => {
      this.logger.error(
        `${this.name} bot shutdown failed: ${error instanceof Error ? error.message : String(error)}`
      )
    })
  }
}

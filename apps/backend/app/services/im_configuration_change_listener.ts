import logger from '@adonisjs/core/services/logger'
import { Client } from 'pg'

import env from '#start/env'

export const IM_CONFIGURATION_CHANGED_CHANNEL = 'qrun_im_configuration_changed'

const RETRY_DELAY_MS = 5_000

type ListenerLogger = Pick<typeof logger, 'error' | 'info'>

export interface ImConfigurationChangeListener {
  start(): Promise<void>
  stop(): Promise<void>
}

interface ImConfigurationChangeListenerOptions {
  onChange: () => Promise<void> | void
  logger?: ListenerLogger
}

/**
 * PostgreSQL LISTEN is session-scoped, so every Bot worker owns a dedicated
 * client instead of borrowing a Lucid pool connection.
 */
export class PostgresImConfigurationChangeListener implements ImConfigurationChangeListener {
  private readonly logger: ListenerLogger
  private client: Client | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connecting = false
  private stopped = true

  constructor(private readonly options: ImConfigurationChangeListenerOptions) {
    this.logger = options.logger ?? logger
  }

  async start() {
    if (!this.stopped) return
    this.stopped = false
    await this.connect()
  }

  async stop() {
    this.stopped = true
    this.connecting = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    const client = this.client
    this.client = null
    if (!client) return

    client.removeAllListeners()
    await client.end().catch(() => undefined)
  }

  private async connect() {
    if (this.stopped || this.connecting || this.client) return
    this.connecting = true

    const client = new Client({
      host: env.get('DB_HOST'),
      port: env.get('DB_PORT'),
      user: env.get('DB_USER'),
      password: env.get('DB_PASSWORD'),
      database: env.get('DB_DATABASE'),
      connectionTimeoutMillis: 10_000,
    })
    let handled = false
    this.client = client

    const handleConnectionLoss = (error?: unknown) => {
      if (handled) return
      handled = true
      this.connecting = false
      if (this.client === client) this.client = null
      client.removeAllListeners()
      void client.end().catch(() => undefined)
      if (this.stopped) return

      if (error) {
        this.logger.error(
          `IM configuration listener disconnected: ${error instanceof Error ? error.message : String(error)}`
        )
      } else {
        this.logger.error('IM configuration listener disconnected')
      }
      this.scheduleReconnect()
    }

    client.on('notification', (message) => {
      if (message.channel !== IM_CONFIGURATION_CHANGED_CHANNEL || this.stopped) return
      void Promise.resolve(this.options.onChange()).catch((error) => {
        this.logger.error(
          `IM configuration reload request failed: ${error instanceof Error ? error.message : String(error)}`
        )
      })
    })
    client.once('error', handleConnectionLoss)
    client.once('end', () => handleConnectionLoss())

    try {
      await client.connect()
      await client.query(`LISTEN ${IM_CONFIGURATION_CHANGED_CHANNEL}`)
      this.connecting = false
      if (this.stopped || this.client !== client) {
        client.removeAllListeners()
        await client.end().catch(() => undefined)
        return
      }

      this.logger.info('IM configuration listener connected')
      // Reconcile after every successful connection so notifications missed
      // while disconnected cannot leave this worker on stale credentials.
      await this.options.onChange()
    } catch (error) {
      handleConnectionLoss(error)
    }
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, RETRY_DELAY_MS)
    this.reconnectTimer.unref?.()
  }
}

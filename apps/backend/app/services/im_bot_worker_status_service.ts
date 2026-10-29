import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'

export const imBotChannels = ['wecom', 'feishu', 'dingtalk'] as const

export type ImBotChannel = (typeof imBotChannels)[number]

export interface ImBotProcessStatus {
  channel: ImBotChannel
  status: 'online' | 'offline'
  pid: number | null
  startedAt: string | null
  lastHeartbeatAt: string | null
}

const HEARTBEAT_INTERVAL_MS = 10_000

type WorkerStatusRow = {
  channel: ImBotChannel
  pid: number
  online: boolean
  started_at: Date | string
  last_heartbeat_at: Date | string
}

function toIsoString(value: Date | string | null | undefined) {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function getImBotProcessStatuses(): Promise<ImBotProcessStatus[]> {
  const result = await db.rawQuery(
    `SELECT channel, pid, started_at, last_heartbeat_at,
       (worker_status = 'running' AND last_heartbeat_at >= CURRENT_TIMESTAMP - INTERVAL '30 seconds') AS online
     FROM im_bot_worker_statuses`
  )
  const rows = result.rows as WorkerStatusRow[]
  const byChannel = new Map(rows.map((row) => [row.channel, row]))

  return imBotChannels.map((channel) => {
    const row = byChannel.get(channel)
    return {
      channel,
      status: row?.online ? 'online' : 'offline',
      pid: row?.pid ?? null,
      startedAt: toIsoString(row?.started_at),
      lastHeartbeatAt: toIsoString(row?.last_heartbeat_at),
    }
  })
}

export async function startImBotWorkerStatusReporter(channel: ImBotChannel) {
  let heartbeatPromise: Promise<void> | null = null

  const reportHeartbeat = () => {
    if (heartbeatPromise) return heartbeatPromise

    heartbeatPromise = db
      .rawQuery(
        `INSERT INTO im_bot_worker_statuses
           (channel, pid, worker_status, started_at, last_heartbeat_at)
         VALUES (?, ?, 'running', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (channel) DO UPDATE SET
           pid = EXCLUDED.pid,
           worker_status = 'running',
           started_at = CASE
             WHEN im_bot_worker_statuses.pid = EXCLUDED.pid
               AND im_bot_worker_statuses.worker_status = 'running'
             THEN im_bot_worker_statuses.started_at
             ELSE EXCLUDED.started_at
           END,
           last_heartbeat_at = CURRENT_TIMESTAMP`,
        [channel, process.pid]
      )
      .then(() => undefined)
      .catch((error) => {
        logger.error({ err: error, channel }, 'Failed to report IM bot worker heartbeat')
      })
      .finally(() => {
        heartbeatPromise = null
      })

    return heartbeatPromise
  }

  await reportHeartbeat()
  const timer = setInterval(() => void reportHeartbeat(), HEARTBEAT_INTERVAL_MS)
  timer.unref()

  return async () => {
    clearInterval(timer)
    if (heartbeatPromise) await heartbeatPromise
    try {
      await db.rawQuery(
        `UPDATE im_bot_worker_statuses
         SET worker_status = 'stopped', last_heartbeat_at = CURRENT_TIMESTAMP
         WHERE channel = ? AND pid = ?`,
        [channel, process.pid]
      )
    } catch (error) {
      logger.error({ err: error, channel }, 'Failed to mark IM bot worker as stopped')
    }
  }
}

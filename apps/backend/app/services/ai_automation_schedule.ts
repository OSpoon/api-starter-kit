import { CronExpressionParser } from 'cron-parser'
import { DateTime } from 'luxon'

import type { AiAutomationScheduleKind } from '#models/ai_automation'

export type AiAutomationScheduleInput = {
  scheduleKind: AiAutomationScheduleKind
  scheduleAt?: string | null
  scheduleTime?: string | null
  scheduleCron?: string | null
  scheduleWeekday?: number | null
  timezone: string
}

function parseCron(expression: string, timezone: string, after: DateTime) {
  const value = expression.trim()
  if (value.split(/\s+/).length !== 5) throw new Error('CRON 表达式必须包含 5 个字段')
  try {
    return CronExpressionParser.parse(value, {
      currentDate: after.toJSDate(),
      tz: timezone,
    })
  } catch {
    throw new Error('CRON 表达式无效或没有下一次执行时间')
  }
}

export function getNextAiAutomationRunTimes(
  expression: string,
  timezone = DateTime.local().zoneName || 'UTC',
  after = DateTime.now()
) {
  return parseCron(expression, timezone, after)
    .take(3)
    .map((date) => DateTime.fromJSDate(date.toDate(), { zone: timezone }))
}

export function validateAiAutomationCronExpression(expression: string) {
  getNextAiAutomationRunTimes(expression, 'UTC')
}

export function getNextAiAutomationRunAt(input: AiAutomationScheduleInput, after = DateTime.now()) {
  const zone = input.timezone.trim()
  const localNow = after.setZone(zone)
  if (!localNow.isValid) throw new Error('时区无效')

  if (input.scheduleKind === 'once') {
    const at = input.scheduleAt ? DateTime.fromISO(input.scheduleAt, { zone }) : null
    if (!at?.isValid || at.toMillis() <= after.toMillis()) {
      throw new Error('单次任务时间必须是未来时间')
    }
    return at.toUTC()
  }

  if (input.scheduleKind === 'cron') {
    return getNextAiAutomationRunTimes(input.scheduleCron ?? '', zone, after)[0].toUTC()
  }

  if (!input.scheduleTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.scheduleTime)) {
    throw new Error('重复任务时间无效')
  }

  const [hour, minute] = input.scheduleTime.split(':').map(Number)
  let candidate = localNow.startOf('day').set({ hour, minute, second: 0, millisecond: 0 })
  if (candidate.toMillis() <= localNow.toMillis()) candidate = candidate.plus({ days: 1 })

  if (input.scheduleKind === 'weekdays') {
    while (candidate.weekday > 5) candidate = candidate.plus({ days: 1 })
  } else if (input.scheduleKind === 'weekly') {
    if (!input.scheduleWeekday || input.scheduleWeekday < 1 || input.scheduleWeekday > 7) {
      throw new Error('每周任务必须选择星期')
    }
    const daysAhead = (input.scheduleWeekday - candidate.weekday + 7) % 7
    candidate = candidate.plus({ days: daysAhead })
    if (candidate.toMillis() <= localNow.toMillis()) candidate = candidate.plus({ days: 7 })
  }

  return candidate.toUTC()
}

export function validateAiAutomationWebhookUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Webhook 地址无效')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Webhook 必须使用 HTTPS 地址，不支持凭据或片段')
  }
  return url.toString()
}

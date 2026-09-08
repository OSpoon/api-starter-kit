import { DateTime } from 'luxon'

export interface AiAgentRuntimeContext {
  currentTime: {
    utc: string
    local: string
    timeZone: string
    weekday: string
  }
  locale: string
}

function toIsoWithoutMilliseconds(value: DateTime) {
  return value.toISO({ suppressMilliseconds: true }) ?? value.toISO() ?? ''
}

export function createAiAgentRuntimeContext(
  now: DateTime<boolean> = DateTime.now()
): AiAgentRuntimeContext {
  const timeZone = now.zoneName ?? 'UTC'
  const local = now.setZone(timeZone)
  const locale = Intl.DateTimeFormat().resolvedOptions().locale

  return {
    currentTime: {
      utc: toIsoWithoutMilliseconds(local.toUTC()),
      local: toIsoWithoutMilliseconds(local),
      timeZone,
      weekday: local.setLocale('zh-CN').toFormat('cccc'),
    },
    locale,
  }
}

export function serializeAiAgentRuntimeContext(now: DateTime<boolean> = DateTime.now()) {
  return JSON.stringify(createAiAgentRuntimeContext(now))
}

import { ApiError, apiRequestCredentials, apiRequestHeaders } from '@/lib/api'

const streamPath = '/api/v1/system/logs/live'

export async function streamBackendLogs(
  token: string | null,
  onLine: (line: string) => void,
  onConnected: () => void,
  signal: AbortSignal
) {
  const headers = apiRequestHeaders(streamPath, { Accept: 'text/event-stream' })
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(streamPath, {
    headers,
    credentials: apiRequestCredentials(streamPath),
    signal,
  })

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null)
    throw new ApiError(payload?.message ?? 'Log stream request failed', response.status)
  }

  onConnected()
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  function consumeEvent(raw: string) {
    const lines = raw.split('\n')
    const event = lines
      .find((line) => line.startsWith('event:'))
      ?.slice('event:'.length)
      .trim()
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .join('\n')

    if (!event || !data) return
    const payload = JSON.parse(data) as { line?: unknown; message?: unknown }
    if (event === 'log' && typeof payload.line === 'string') onLine(payload.line)
    if (event === 'error') {
      throw new Error(typeof payload.message === 'string' ? payload.message : 'Log stream failed')
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      events.forEach(consumeEvent)

      if (done) {
        if (buffer.trim()) consumeEvent(buffer)
        break
      }
    }
  } finally {
    reader.releaseLock()
  }
}

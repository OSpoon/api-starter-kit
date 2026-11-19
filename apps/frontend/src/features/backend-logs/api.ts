import { ApiError, apiRequestCredentials, apiRequestHeaders } from '@/lib/api'
import { readSseEvents } from '@/lib/sse'

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
  await readSseEvents(response.body, (event, data) => {
    const payload = JSON.parse(data) as { line?: unknown; message?: unknown }
    if (event === 'log' && typeof payload.line === 'string') onLine(payload.line)
    if (event === 'error') {
      throw new Error(typeof payload.message === 'string' ? payload.message : 'Log stream failed')
    }
  })
}

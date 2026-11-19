export async function readSseEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: string) => void
) {
  const reader = body.getReader()
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

    if (event && data) onEvent(event, data)
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

import { setRuntimeEmbedAuth } from '@/lib/api'

export function initializeAssistantEmbed() {
  const parameters = new URLSearchParams(window.location.hash.slice(1))
  const apiKey = parameters.get('apiKey')
  const sessionId = parameters.get('sessionId')
  if (!apiKey || !sessionId) return false

  setRuntimeEmbedAuth({ apiKey, sessionId })
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  return true
}

export function notifyAssistantEmbedResize(open: boolean) {
  if (window.parent === window || !document.referrer) return

  try {
    window.parent.postMessage(
      { type: 'assistant-embed:resize', open },
      new URL(document.referrer).origin
    )
  } catch {
    // Ignore a missing or invalid embedding origin.
  }
}

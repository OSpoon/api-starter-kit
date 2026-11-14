;(() => {
  const script = document.currentScript
  const apiKey = script?.dataset.apiKey
  if (!script || !apiKey) return

  const storageKey = `api-starter-kit:assistant-embed-session:v1:${apiKey.slice(0, 12)}`
  let sessionId
  try {
    sessionId = window.localStorage.getItem(storageKey)
    if (!sessionId) {
      sessionId = window.crypto.randomUUID()
      window.localStorage.setItem(storageKey, sessionId)
    }
  } catch {
    sessionId = window.crypto.randomUUID()
  }

  const assistantOrigin = new URL(script.src).origin
  const iframe = document.createElement('iframe')
  const embedUrl = new URL('/embed', assistantOrigin)
  embedUrl.hash = new URLSearchParams({ apiKey, sessionId }).toString()
  iframe.src = embedUrl.href
  iframe.title = 'AI assistant'
  iframe.allow = 'microphone; clipboard-write'
  iframe.referrerPolicy = 'origin'
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:88px;height:88px;border:0;z-index:2147483647;background:transparent'

  function resize(open) {
    iframe.style.width = open ? `${Math.max(80, Math.min(window.innerWidth - 32, 420))}px` : '88px'
    iframe.style.height = open
      ? `${Math.max(80, Math.min(window.innerHeight - 32, 760))}px`
      : '88px'
  }

  window.addEventListener('message', (event) => {
    if (event.source !== iframe.contentWindow || event.origin !== assistantOrigin) return
    if (event.data?.type === 'assistant-embed:resize') resize(event.data.open === true)
  })
  window.addEventListener('resize', () => {
    if (iframe.style.width !== '88px') resize(true)
  })

  const mount = () => document.body.append(iframe)
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount, { once: true })
})()

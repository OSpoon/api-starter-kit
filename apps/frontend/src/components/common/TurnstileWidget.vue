<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

interface TurnstileInstance {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    }
  ) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileInstance
  }
}

const props = defineProps<{ siteKey: string }>()
const emit = defineEmits<{
  token: [value: string]
  expired: []
  error: []
}>()

const container = ref<HTMLElement | null>(null)
let widgetId: string | undefined
let script: HTMLScriptElement | null = null

function loadScript() {
  if (window.turnstile) {
    return Promise.resolve()
  }

  const existing = document.querySelector<HTMLScriptElement>(
    'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
  )
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Turnstile failed to load')), {
        once: true,
      })
    })
  }

  script = document.createElement('script')
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
  script.async = true
  script.defer = true
  document.head.appendChild(script)

  return new Promise<void>((resolve, reject) => {
    script!.addEventListener('load', () => resolve(), { once: true })
    script!.addEventListener('error', () => reject(new Error('Turnstile failed to load')), {
      once: true,
    })
  })
}

async function renderWidget() {
  try {
    await loadScript()
    if (!container.value || !window.turnstile) {
      emit('error')
      return
    }

    widgetId = window.turnstile.render(container.value, {
      sitekey: props.siteKey,
      callback: (token) => emit('token', token),
      'expired-callback': () => emit('expired'),
      'error-callback': () => emit('error'),
    })
  } catch {
    emit('error')
  }
}

function reset() {
  window.turnstile?.reset(widgetId)
  emit('expired')
}

defineExpose({ reset })

onMounted(() => void renderWidget())

onBeforeUnmount(() => {
  if (widgetId) {
    window.turnstile?.remove(widgetId)
  }
})
</script>

<template>
  <div ref="container" class="flex min-h-16 justify-center" aria-live="polite" />
</template>

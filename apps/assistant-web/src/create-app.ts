import './assets/main.css'

import i18n, { loadLocaleMessages } from '@/i18n'

import App from './App.vue'
import router from './router'
import { initializeAssistantRuntime } from '@assistant/lib/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { type Component, createApp } from 'vue'

const fallbackLocale = i18n.global.fallbackLocale.value
const fallbackLocaleStr =
  typeof fallbackLocale === 'string'
    ? fallbackLocale
    : Array.isArray(fallbackLocale) && fallbackLocale.length > 0
      ? fallbackLocale[0]!
      : 'en'

export async function createAssistantApp(rootComponent: Component = App) {
  const app = createApp(rootComponent)
  const pinia = createPinia()

  setActivePinia(pinia)
  initializeAssistantRuntime()
  app.use(pinia)
  app.use(i18n)
  app.use(router)

  await Promise.all([
    loadLocaleMessages(i18n.global.locale.value),
    loadLocaleMessages(fallbackLocaleStr),
  ])

  return app
}

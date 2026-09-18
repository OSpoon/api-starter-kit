import './assets/main.css'

import i18n, { loadLocaleMessages } from '@/i18n'

import App from './App.vue'
import router from '@assistant/router'
import { createPinia, setActivePinia } from 'pinia'

const app = createApp(App)
const pinia = createPinia()

setActivePinia(pinia)
app.use(pinia)
app.use(i18n)
app.use(router)

const fallbackLocale = i18n.global.fallbackLocale.value
const fallbackLocaleStr =
  typeof fallbackLocale === 'string'
    ? fallbackLocale
    : Array.isArray(fallbackLocale) && fallbackLocale.length > 0
      ? fallbackLocale[0]!
      : 'en'

await Promise.all([
  loadLocaleMessages(i18n.global.locale.value),
  loadLocaleMessages(fallbackLocaleStr),
])

app.mount('#app')

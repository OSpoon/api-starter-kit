import './assets/main.css'

import { createPinia, setActivePinia } from 'pinia'

import App from './App.vue'
import { permissionDirective } from './directives/permission'
import i18n, { loadLocaleMessages } from './i18n'
import router from './router'

const app = createApp(App)

// Create and explicitly activate Pinia before installing the router.
// The router's beforeEach guard calls useAuthStore() during initial
// navigation; setActivePinia() ensures getActivePinia() never returns null
// even across the top-level await boundary below.
const pinia = createPinia()
setActivePinia(pinia)
app.use(pinia)
app.use(i18n)
app.use(router)
app.directive('permission', permissionDirective)

// Load the user's locale and the fallback locale before mounting so the
// first render has translations. Each locale is a separate lazy chunk.
// In legacy:false mode, fallbackLocale is typed as FallbackLocales<string>
// (string | string[] | false); normalize to a single string for loading.
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

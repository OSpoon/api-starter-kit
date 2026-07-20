import { createI18n } from 'vue-i18n'

import { getStoredLocale } from './lib/browser-preferences'

// Locale messages are loaded lazily so each locale is a separate chunk
// fetched on demand instead of being inlined into the initial bundle.
// Only the user's stored locale and the fallback (en) are loaded before
// first render; other locales are fetched when the user switches to them.
const localeModules = import.meta.glob('./locales/*.json')

const i18n = createI18n({
  legacy: false,
  locale: getStoredLocale(),
  fallbackLocale: 'en',
})

const loadedLocales = new Set<string>()

/**
 * Loads a locale's messages on demand and registers them with vue-i18n.
 * 'zh' is aliased to the 'zh-CN' file for broader locale matching.
 */
export async function loadLocaleMessages(locale: string): Promise<void> {
  if (loadedLocales.has(locale)) return

  const fileLocale = locale === 'zh' ? 'zh-CN' : locale
  const importer = localeModules[`./locales/${fileLocale}.json`]
  if (!importer) return

  const mod = await importer()
  const messages = (mod as { default: Record<string, unknown> }).default

  i18n.global.setLocaleMessage(locale, messages)
  // Also register under the file locale so both resolve to the same messages.
  if (fileLocale !== locale) {
    i18n.global.setLocaleMessage(fileLocale, messages)
    loadedLocales.add(fileLocale)
  }
  loadedLocales.add(locale)
}

export default i18n

import { createI18n } from 'vue-i18n'

import { getStoredLocale } from './lib/browser-preferences'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

const i18n = createI18n({
  legacy: false,
  locale: getStoredLocale(),
  fallbackLocale: 'en',
  messages: {
    en,
    'zh-CN': zhCN,
    zh: zhCN,
  },
})

export default i18n

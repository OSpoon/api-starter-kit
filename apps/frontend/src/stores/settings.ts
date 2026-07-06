import { defineStore } from 'pinia'
import { computed } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const platformName = computed(() => import.meta.env.VITE_PLATFORM_NAME || 'API Starter Kit')
  const platformTagline = computed(
    () => import.meta.env.VITE_PLATFORM_TAGLINE || 'Full-stack Starter Template'
  )

  return {
    platformName,
    platformTagline,
  }
})

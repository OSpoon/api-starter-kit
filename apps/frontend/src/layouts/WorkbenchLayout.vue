<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import AppSidebar from '@/components/AppSidebar.vue'
import SiteHeader from '@/components/SiteHeader.vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useSettingsStore } from '@/stores/settings'

const route = useRoute()
const { t } = useI18n()
const settingsStore = useSettingsStore()

const breadcrumbs = computed(() => {
  type Crumb = { label: string; to?: string }

  const title = (route.meta.title as string) || ''
  if (!title) {
    return [] satisfies Crumb[]
  }

  return [{ label: t(title), to: route.path }] satisfies Crumb[]
})
</script>

<template>
  <SidebarProvider class="h-svh overflow-hidden">
    <AppSidebar />
    <SidebarInset class="flex min-h-0 flex-col overflow-hidden">
      <SiteHeader :breadcrumbs="breadcrumbs" />
      <div class="flex flex-1 flex-col overflow-auto bg-muted/5 font-sans">
        <div class="flex-1">
          <RouterView />
        </div>
        <footer class="py-4 text-center text-sm text-muted-foreground">
          {{ t('footer.built_by', { platform: settingsStore.platformName }) }}
        </footer>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>

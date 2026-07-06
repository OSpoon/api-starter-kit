<script setup lang="ts">
import { Activity, Key } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'

import NavMain from '@/components/NavMain.vue'
import NavUser from '@/components/NavUser.vue'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

withDefaults(
  defineProps<{
    variant?: 'sidebar' | 'floating' | 'inset'
  }>(),
  {
    variant: 'inset',
  }
)

const auth = useAuthStore()
const router = useRouter()
const settingsStore = useSettingsStore()
const { t } = useI18n()

const sidebarUser = computed(() => {
  const name = auth.user?.fullName || auth.user?.email || 'User'

  return {
    name,
    email: auth.user?.email || '',
    avatar: '',
  }
})

const systemItems = computed(() => [
  {
    title: t('sidebar.api_keys'),
    url: '/api-keys',
    icon: Key,
  },
])

async function handleLogout() {
  await auth.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <Sidebar collapsible="offcanvas" :variant="variant">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child>
            <RouterLink to="/api-keys">
              <div
                class="flex aspect-square size-8 items-center justify-center rounded-lg border bg-background shadow-xs"
              >
                <Activity class="size-5 text-primary" />
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-medium">{{ settingsStore.platformName }}</span>
                <span class="truncate text-xs font-medium text-muted-foreground">
                  {{ settingsStore.platformTagline }}
                </span>
              </div>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <NavMain :title="t('sidebar.system')" :items="systemItems" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="sidebarUser" @logout="handleLogout" />
    </SidebarFooter>
  </Sidebar>
</template>

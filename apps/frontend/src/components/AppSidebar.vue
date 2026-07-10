<script setup lang="ts">
import { Activity } from '@lucide/vue'
import type { Component } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { type RouteRecordNormalized, RouterLink, useRouter } from 'vue-router'

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

interface NavMeta {
  group: string
  icon?: Component
  order?: number
}

interface NavGroup {
  title: string
  order: number
  items: Array<{
    title: string
    url: string
    icon?: Component
    order: number
  }>
}

const sidebarUser = computed(() => {
  const name = auth.user?.fullName || auth.user?.email || 'User'

  return {
    name,
    email: auth.user?.email || '',
    avatar: '',
  }
})

function getRouteNav(route: RouteRecordNormalized) {
  return route.meta.nav as NavMeta | undefined
}

const navGroups = computed(() => {
  const groups = new Map<string, NavGroup>()

  for (const route of router.getRoutes()) {
    const nav = getRouteNav(route)
    const title = route.meta.title as string | undefined

    if (!nav || !title) {
      continue
    }

    const group = groups.get(nav.group) ?? {
      title: t(nav.group),
      order: nav.order ?? 0,
      items: [],
    }

    group.order = Math.min(group.order, nav.order ?? group.order)
    group.items.push({
      title: t(title),
      url: route.path,
      icon: nav.icon,
      order: nav.order ?? 0,
    })
    groups.set(nav.group, group)
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
})

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
            <RouterLink to="/dashboard">
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
      <NavMain
        v-for="group in navGroups"
        :key="group.title"
        :title="group.title"
        :items="group.items"
      />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="sidebarUser" @logout="handleLogout" />
    </SidebarFooter>
  </Sidebar>
</template>

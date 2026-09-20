<script setup lang="ts">
import type { Component } from 'vue'
import type { RouteRecordName } from 'vue-router'

import PageShell from '@/components/common/PageShell.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { usePermission } from '@/lib/permission'

interface NavigationMeta {
  group: string
  groupOrder?: number
  icon?: Component
  order?: number
}

const router = useRouter()
const { t } = useI18n()
const { can } = usePermission()

const accessibleLinks = computed(() =>
  router
    .getRoutes()
    .flatMap((route) => {
      const permission = route.meta.permission
      const title = route.meta.title
      const nav = route.meta.nav as NavigationMeta | undefined

      if (
        route.name === 'dashboard' ||
        !route.name ||
        !permission ||
        !title ||
        !nav ||
        !can(permission)
      ) {
        return []
      }

      return [
        {
          name: route.name as RouteRecordName,
          title: t(title as string),
          group: t(nav.group),
          icon: nav.icon,
          groupOrder: nav.groupOrder ?? nav.order ?? 0,
          order: nav.order ?? 0,
        },
      ]
    })
    .sort((left, right) => left.groupOrder - right.groupOrder || left.order - right.order)
)
</script>

<template>
  <PageShell :title="t('dashboard.title')" :description="t('dashboard.desc')" class="gap-4">
    <section class="space-y-3">
      <h2 class="text-sm font-medium text-muted-foreground">{{ t('dashboard.quick_access') }}</h2>
      <div v-if="accessibleLinks.length" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <RouterLink
          v-for="link in accessibleLinks"
          :key="String(link.name)"
          :to="{ name: link.name }"
          class="group rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Card
            class="h-full transition-colors group-hover:border-primary/50 group-hover:bg-muted/30"
          >
            <CardHeader class="flex flex-row items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <CardTitle class="text-base">{{ link.title }}</CardTitle>
                <CardDescription>{{ link.group }}</CardDescription>
              </div>
              <component
                :is="link.icon"
                v-if="link.icon"
                class="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
            </CardHeader>
            <CardContent class="pt-0 text-sm font-medium text-primary">
              {{ t('dashboard.open_module') }}
            </CardContent>
          </Card>
        </RouterLink>
      </div>
      <p v-else class="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        {{ t('dashboard.no_modules') }}
      </p>
    </section>
  </PageShell>
</template>

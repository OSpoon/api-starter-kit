<script setup lang="ts">
import { KeyRound, Route, ShieldCheck } from '@lucide/vue'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const { t } = useI18n()

const stats = computed(() => [
  {
    label: t('dashboard.stats.auth'),
    value: 'Bearer Token',
    icon: ShieldCheck,
  },
  {
    label: t('dashboard.stats.api_keys'),
    value: '4',
    icon: KeyRound,
  },
  {
    label: t('dashboard.stats.routes'),
    value: '12',
    icon: Route,
  },
])

const checklist = computed(() => [
  t('dashboard.checklist.route_nav'),
  t('dashboard.checklist.openapi'),
  t('dashboard.checklist.schema_builder'),
])
</script>

<template>
  <div class="flex h-full flex-col gap-4 p-8">
    <div class="grid gap-4 md:grid-cols-3">
      <Card v-for="stat in stats" :key="stat.label">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardDescription>{{ stat.label }}</CardDescription>
          <component :is="stat.icon" class="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-semibold">{{ stat.value }}</div>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>{{ t('dashboard.structure_title') }}</CardTitle>
        <CardDescription>{{ t('dashboard.structure_desc') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul class="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
          <li
            v-for="item in checklist"
            :key="item"
            class="rounded-md border bg-background px-3 py-2"
          >
            {{ item }}
          </li>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>

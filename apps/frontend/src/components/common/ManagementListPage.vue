<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import { Button } from '@/components/ui/button'

defineProps<{
  title: string
  description?: string
  loading?: boolean
  refreshLabel: string
  actionLabel: string
}>()

const emit = defineEmits<{
  refresh: []
  action: []
}>()

const slots = useSlots()
</script>

<template>
  <div class="flex h-full flex-col gap-4 p-8">
    <PageHeader :title="title" :description="description">
      <template #actions>
        <Button variant="outline" size="sm" :disabled="loading" @click="emit('refresh')">
          <slot name="refresh-icon" />
          {{ refreshLabel }}
        </Button>
        <Button size="sm" @click="emit('action')">
          <slot name="action-icon" />
          {{ actionLabel }}
        </Button>
      </template>
    </PageHeader>

    <slot name="summary" />

    <section class="space-y-4 rounded-lg border bg-card p-4">
      <div v-if="slots.query" class="rounded-md border bg-muted/20 p-4">
        <slot name="query" />
      </div>

      <div v-if="slots.operations" class="
        flex flex-wrap items-center justify-between gap-3
      ">
        <slot name="operations" />
      </div>

      <slot>
        <slot name="list" />
      </slot>

      <div v-if="slots.pagination">
        <slot name="pagination" />
      </div>
    </section>

    <slot name="dialogs" />
  </div>
</template>

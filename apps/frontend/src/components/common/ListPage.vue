<script setup lang="ts">
import PageShell from '@/components/common/PageShell.vue'
import { Button } from '@/components/ui/button'

defineProps<{
  title: string
  description?: string
  loading?: boolean
  refreshLabel: string
  actionLabel: string
  showAction?: boolean
}>()

const emit = defineEmits<{
  refresh: []
  action: []
}>()

const slots = useSlots()
</script>

<template>
  <PageShell :title="title" :description="description" class="min-h-0 gap-4 overflow-hidden pb-0">
    <template #actions>
      <Button variant="outline" size="sm" :disabled="loading" @click="emit('refresh')">
        <slot name="refresh-icon" />
        {{ refreshLabel }}
      </Button>
      <Button v-if="showAction !== false" size="sm" @click="emit('action')">
        <slot name="action-icon" />
        {{ actionLabel }}
      </Button>
    </template>

    <slot name="summary" />

    <section
      class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden rounded-lg border bg-card p-4"
    >
      <div v-if="slots.query" class="shrink-0 rounded-md border bg-muted/20 p-4">
        <slot name="query" />
      </div>

      <div
        v-if="slots.operations"
        class="flex shrink-0 flex-wrap items-center justify-between gap-3"
      >
        <slot name="operations" />
      </div>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <slot>
          <slot name="list" />
        </slot>
      </div>

      <div v-if="slots.pagination" class="shrink-0">
        <slot name="pagination" />
      </div>
    </section>

    <slot name="dialogs" />
  </PageShell>
</template>

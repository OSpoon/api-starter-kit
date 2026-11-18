<script setup lang="ts">
import { listPageHeaderKey } from '@/components/common/list-page-context'
import PageShell from '@/components/common/PageShell.vue'

const props = withDefaults(
  defineProps<{
    title: string
    loading?: boolean
    actionLabel: string
    showAction?: boolean
    showHeader?: boolean
    moveHeadingToTable?: boolean
  }>(),
  { showHeader: true, moveHeadingToTable: true }
)

const emit = defineEmits<{
  action: []
}>()

provide(listPageHeaderKey, {
  title: computed(() => (props.moveHeadingToTable ? props.title : '')),
  loading: computed(() => Boolean(props.loading)),
  actionLabel: computed(() => props.actionLabel),
  showAction: computed(() => props.showAction !== false),
  onAction: () => emit('action'),
})

const slots = useSlots()
</script>

<template>
  <PageShell
    :title="moveHeadingToTable ? '' : title"
    :header-class="showHeader && !moveHeadingToTable ? undefined : 'hidden'"
    class="min-h-0 gap-4 overflow-hidden pt-8 pb-0"
  >
    <slot name="summary" />

    <section class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
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

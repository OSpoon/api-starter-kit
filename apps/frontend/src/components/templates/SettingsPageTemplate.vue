<script setup lang="ts">
import PageShell from '@/components/common/PageShell.vue'

defineProps<{
  title: string
  description?: string
}>()

const slots = useSlots()
</script>

<template>
  <PageShell
    :title="title"
    :description="description"
    :header-class="slots.navigation ? undefined : 'mx-auto w-full max-w-3xl'"
  >
    <template #actions><slot name="actions" /></template>
    <div
      :class="
        slots.navigation
          ? 'grid gap-6 lg:grid-cols-[14rem_minmax(0,42rem)]'
          : 'mx-auto w-full max-w-3xl space-y-6'
      "
    >
      <nav v-if="$slots.navigation" class="lg:sticky lg:top-6 lg:h-fit">
        <slot name="navigation" />
      </nav>
      <main class="min-w-0 space-y-6"><slot /></main>
    </div>
  </PageShell>
</template>

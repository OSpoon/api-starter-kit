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
          ? 'grid min-h-0 min-w-0 flex-1 gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]'
          : 'mx-auto w-full max-w-3xl space-y-6'
      "
    >
      <nav v-if="$slots.navigation" class="lg:sticky lg:top-6 lg:h-fit">
        <slot name="navigation" />
      </nav>
      <main :class="slots.navigation ? 'flex min-h-0 min-w-0 flex-col gap-6' : 'min-w-0 space-y-6'">
        <slot />
      </main>
    </div>
  </PageShell>
</template>

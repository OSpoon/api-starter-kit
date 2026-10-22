<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    descriptionClass?: string
    maxWidthClass?: string
    muted?: boolean
    contentClass?: string
    cardClass?: string
  }>(),
  {
    description: undefined,
    descriptionClass: undefined,
    maxWidthClass: 'max-w-md',
    muted: false,
    contentClass: undefined,
    cardClass: undefined,
  }
)

const pageClass = computed(() => [
  'flex min-h-svh w-full items-center justify-center p-6 md:p-10',
  props.muted ? 'bg-muted' : undefined,
])
</script>

<template>
  <main :class="pageClass">
    <div :class="['w-full', maxWidthClass]">
      <Card
        :class="[
          $slots.aside
            ? 'grid grid-cols-1 gap-0 overflow-hidden p-0 lg:grid-cols-[5fr_3fr]'
            : undefined,
          cardClass,
        ]"
      >
        <aside
          v-if="$slots.aside"
          class="relative min-h-48 overflow-hidden bg-gradient-to-br from-primary/5 via-background to-secondary p-6 text-foreground sm:p-8 lg:min-h-[560px] lg:p-12"
        >
          <slot name="aside" />
        </aside>
        <div
          :class="[
            $slots.aside
              ? 'flex w-full min-w-0 flex-col justify-center gap-4 px-6 py-8 sm:px-8 sm:py-10 lg:px-10'
              : 'flex flex-col gap-6',
          ]"
        >
          <CardHeader :class="$slots.aside ? 'px-0' : undefined">
            <CardTitle>{{ title }}</CardTitle>
            <CardDescription v-if="description" :class="descriptionClass">
              {{ description }}
            </CardDescription>
          </CardHeader>
          <CardContent :class="[$slots.aside ? 'px-0 pb-0' : undefined, contentClass]">
            <slot />
          </CardContent>
        </div>
      </Card>
    </div>
  </main>
</template>

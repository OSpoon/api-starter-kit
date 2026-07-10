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
      <Card :class="cardClass">
        <CardHeader>
          <CardTitle>{{ title }}</CardTitle>
          <CardDescription v-if="description" :class="descriptionClass">
            {{ description }}
          </CardDescription>
        </CardHeader>
        <CardContent :class="contentClass">
          <slot />
        </CardContent>
      </Card>
    </div>
  </main>
</template>

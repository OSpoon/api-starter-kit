<script setup lang="ts">
import type { Component } from 'vue'

import { Button } from '@/components/ui/button'

defineProps<{
  items: { value: string; label: string; icon: Component }[]
  label: string
}>()

const activeSection = defineModel<string>({ required: true })
</script>

<template>
  <nav :aria-label="label">
    <div class="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
      <Button
        v-for="item in items"
        :key="item.value"
        type="button"
        variant="ghost"
        class="h-auto min-h-10 w-full justify-start gap-3 px-3 py-2 text-left"
        :class="{
          'bg-sidebar-accent font-medium text-sidebar-accent-foreground':
            activeSection === item.value,
        }"
        :aria-current="activeSection === item.value ? 'page' : undefined"
        @click="activeSection = item.value"
      >
        <component :is="item.icon" class="size-4 shrink-0" />
        <span class="min-w-0 whitespace-normal">{{ item.label }}</span>
      </Button>
    </div>
  </nav>
</template>

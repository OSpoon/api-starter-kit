<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

defineProps<{ id: string; label: string; placeholder: string }>()
const value = defineModel<string>({ default: '' })
</script>

<template>
  <div class="grid min-w-0 gap-1.5 text-sm font-normal">
    <Label :for="id" class="font-normal whitespace-nowrap">{{ label }}</Label>
    <Input :id="id" v-model.trim="value" class="w-full" :placeholder="placeholder" />
  </div>
</template>

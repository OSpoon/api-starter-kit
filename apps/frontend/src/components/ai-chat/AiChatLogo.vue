<script setup lang="ts">
import assistantLogo from '@/assets/assistant-logo.svg'

defineProps<{
  alt?: string
}>()
</script>

<template>
  <img :src="assistantLogo" :alt="alt ?? ''" class="size-full object-contain" />
</template>

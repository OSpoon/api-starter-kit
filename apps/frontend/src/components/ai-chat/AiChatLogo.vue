<script setup lang="ts">
defineProps<{
  alt?: string
}>()
</script>

<template>
  <img src="/assistant-logo.svg" :alt="alt ?? ''" class="size-full object-contain" />
</template>

<script setup lang="ts">
import 'vue-sonner/style.css'

import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import { Toaster } from '@/components/ui/sonner'
import { useWebUpdateNotification } from '@/composables/useWebUpdateNotification'

useWebUpdateNotification()
</script>

<template>
  <ErrorBoundary>
    <RouterView />
  </ErrorBoundary>
  <Toaster />
</template>

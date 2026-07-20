<script setup lang="ts">
import 'vue-sonner/style.css'

import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import { Toaster } from '@/components/ui/sonner'
</script>

<template>
  <ErrorBoundary>
    <RouterView />
  </ErrorBoundary>
  <Toaster />
</template>

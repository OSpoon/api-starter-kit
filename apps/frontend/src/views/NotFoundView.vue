<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const { t } = useI18n()
</script>

<template>
  <main class="flex min-h-svh items-center justify-center bg-muted p-6">
    <Card class="w-full max-w-md text-center">
      <CardHeader>
        <CardTitle>{{ t('not_found.title') }}</CardTitle>
        <CardDescription>{{ t('not_found.desc') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button as-child>
          <RouterLink to="/api-keys">{{ t('not_found.back') }}</RouterLink>
        </Button>
      </CardContent>
    </Card>
  </main>
</template>

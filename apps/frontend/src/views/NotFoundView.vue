<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import CardPageShell from '@/components/common/CardPageShell.vue'
import { Button } from '@/components/ui/button'

const { t } = useI18n()
</script>

<template>
  <CardPageShell
    :title="t('not_found.title')"
    :description="t('not_found.desc')"
    card-class="text-center"
    muted
  >
    <Button as-child>
      <RouterLink to="/api-keys">{{ t('not_found.back') }}</RouterLink>
    </Button>
  </CardPageShell>
</template>

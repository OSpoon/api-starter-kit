<script setup lang="ts">
import CardPageShell from '@/components/common/CardPageShell.vue'

const { t } = useI18n()
</script>

<template>
  <CardPageShell :title="t('assistant_embed.invalid_title')">
    <p class="text-sm text-muted-foreground">{{ t('assistant_embed.invalid_description') }}</p>
  </CardPageShell>
</template>

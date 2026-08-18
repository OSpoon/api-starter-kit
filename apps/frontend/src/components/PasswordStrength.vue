<script setup lang="ts">
import { hasPasswordContextToken, passwordComposition } from '@/lib/password'
import { cn } from '@/lib/utils'

const props = defineProps<{
  password: string
  userInputs?: string[]
}>()

const { t } = useI18n()

const criteria = computed(() => {
  const value = props.password
  const composition = passwordComposition(value)
  return [
    { label: t('password_strength.length'), met: composition.length },
    { label: t('password_strength.uppercase'), met: composition.uppercase },
    { label: t('password_strength.lowercase'), met: composition.lowercase },
    { label: t('password_strength.number'), met: composition.number },
    { label: t('password_strength.special'), met: composition.special },
    {
      label: t('password_strength.context'),
      met: value.length === 0 || !hasPasswordContextToken(value, props.userInputs ?? []),
    },
  ]
})

const progress = computed(() => {
  if (!props.password) {
    return 0
  }

  const metCount = criteria.value.filter((item) => item.met).length
  return (metCount / criteria.value.length) * 100
})

const strengthLabel = computed(() => {
  const value = progress.value
  if (value === 0) return ''
  if (value < 40) return t('password_strength.weak')
  if (value < 80) return t('password_strength.medium')
  if (value < 100) return t('password_strength.strong')
  return t('password_strength.very_strong')
})

const colorClass = computed(() => {
  const value = progress.value
  if (value < 40) return 'bg-destructive'
  if (value < 80) return 'bg-chart-4'
  if (value < 100) return 'bg-accent'
  return 'bg-chart-3'
})
</script>

<template>
  <div class="space-y-2">
    <div class="mb-1 flex justify-between text-xs">
      <span class="text-muted-foreground">{{ t('password_strength.label') }}</span>
      <span
        :class="
          cn(
            'font-medium',
            progress < 40
              ? 'text-destructive'
              : progress < 80
                ? 'text-chart-4'
                : progress < 100
                  ? 'text-accent'
                  : 'text-chart-3'
          )
        "
      >
        {{ strengthLabel }}
      </span>
    </div>

    <div class="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div
        class="h-full transition-all duration-300 ease-in-out"
        :class="colorClass"
        :style="{ width: `${progress}%` }"
      />
    </div>

    <ul class="mt-2 space-y-1 text-xs">
      <li v-for="(item, index) in criteria" :key="index" class="flex items-center gap-2">
        <span v-if="item.met" class="text-chart-3">✓</span>
        <span v-else class="text-muted-foreground">○</span>
        <span :class="item.met ? 'text-foreground' : 'text-muted-foreground'">{{
          item.label
        }}</span>
      </li>
    </ul>
  </div>
</template>

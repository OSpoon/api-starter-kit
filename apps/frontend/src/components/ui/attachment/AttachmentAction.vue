<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { ButtonVariants } from '../button'
import Button from '../button/Button.vue'

interface Props extends PrimitiveProps {
  class?: HTMLAttributes['class']
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'ghost',
  size: 'icon-sm',
})
</script>

<template>
  <Button data-slot="attachment-action" :variant="props.variant" :size="props.size">
    <slot />
  </Button>
</template>

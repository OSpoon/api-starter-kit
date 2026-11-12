<script setup lang="ts">
import type { InputGroupButtonProps } from '.'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { inputGroupButtonVariants } from '.'

const props = withDefaults(defineProps<InputGroupButtonProps>(), {
  type: 'button',
  size: 'xs',
  variant: 'ghost',
})
</script>

<template>
  <Button
    :type="props.type"
    :data-size="props.size"
    :variant="props.variant"
    :class="cn(inputGroupButtonVariants({ size: props.size }), props.class)"
  >
    <slot />
  </Button>
</template>

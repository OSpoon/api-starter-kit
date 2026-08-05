<script setup lang="ts">
import type { DialogTitleProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { DialogTitle } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <DialogTitle
    data-slot="sheet-title"
    :class="cn('text-lg font-semibold leading-none text-foreground cn-font-heading', props.class)"
    v-bind="delegatedProps"
  >
    <slot />
  </DialogTitle>
</template>

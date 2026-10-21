<script setup lang="ts">
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

withDefaults(
  defineProps<{
    id?: string
    fullWidth?: boolean
    maxlength?: number
    slotClass?: string
  }>(),
  {
    id: undefined,
    maxlength: 6,
  }
)

const modelValue = defineModel<string>({ default: '' })
</script>

<template>
  <InputOTP :id="id" v-model="modelValue" :maxlength="maxlength" :class="fullWidth && 'w-full'">
    <InputOTPGroup :class="fullWidth && 'w-full'">
      <InputOTPSlot
        v-for="index in maxlength"
        :key="index"
        :index="index - 1"
        :class="[slotClass, fullWidth && 'min-w-0 flex-1']"
      />
    </InputOTPGroup>
  </InputOTP>
</template>

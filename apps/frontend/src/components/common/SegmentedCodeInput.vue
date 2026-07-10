<script setup lang="ts">
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

withDefaults(
  defineProps<{
    id?: string
    maxlength?: number
  }>(),
  {
    id: undefined,
    maxlength: 6,
  }
)

const modelValue = defineModel<string>({ default: '' })
</script>

<template>
  <InputOTP :id="id" v-model="modelValue" :maxlength="maxlength">
    <InputOTPGroup>
      <InputOTPSlot v-for="index in maxlength" :key="index" :index="index - 1" />
    </InputOTPGroup>
  </InputOTP>
</template>

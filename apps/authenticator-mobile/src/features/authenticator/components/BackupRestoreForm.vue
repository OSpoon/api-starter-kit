<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { computed, ref } from 'vue'
import { useForm } from 'vee-validate'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { z } from 'zod'

import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import SegmentedCodeInput from '@/components/common/SegmentedCodeInput.vue'
import { Button } from '@/components/ui/button'
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { firstFormError } from '@/lib/form-validation'

const props = defineProps<{ busy: boolean; hasBackup: boolean }>()
const emit = defineEmits<{ submit: [password: string]; cancel: [] }>()
const { t } = useI18n()
const useLegacyPassword = ref(false)
const form = useForm({
  validationSchema: computed(() =>
    toTypedSchema(
      z.object({
        password: useLegacyPassword.value
          ? z.string().min(1, t('backupPasswordRequired')).max(256)
          : z.string().regex(/^\d{6}$/, t('backupPasswordDigits')),
      })
    )
  ),
  initialValues: { password: '' },
})

function togglePasswordMode(): void {
  useLegacyPassword.value = !useLegacyPassword.value
  form.setFieldValue('password', '')
}

const submit = form.handleSubmit(
  ({ password }) => emit('submit', password),
  ({ errors }) => toast.error(firstFormError(errors, t('formInvalid')))
)
</script>

<template>
  <form class="grid gap-4" autocomplete="off" novalidate @submit.prevent="submit">
    <FormField v-slot="{ componentField }" name="password" :validate-on-blur="false">
      <FormItem>
        <FormLabel>{{
          t(useLegacyPassword ? 'backupPasswordLegacy' : 'backupPassword')
        }}</FormLabel>
        <FormControl>
          <Input
            v-if="useLegacyPassword"
            v-bind="componentField"
            type="password"
            maxlength="256"
            autocomplete="current-password"
          />
          <SegmentedCodeInput
            v-else
            v-bind="componentField"
            full-width
            :maxlength="6"
            slot-class="h-12 text-lg max-[380px]:h-10"
            inputmode="numeric"
            pattern="^[0-9]*$"
            autocomplete="off"
          />
        </FormControl>
      </FormItem>
    </FormField>
    <Button
      variant="link"
      size="sm"
      class="justify-start px-0"
      type="button"
      @click="togglePasswordMode"
      >{{ t(useLegacyPassword ? 'useSixDigitBackupPassword' : 'useLegacyBackupPassword') }}</Button
    >
    <FormDialogFooter
      class="shrink-0 justify-end px-0 pb-0 [&>div:last-child]:w-full [&>div:last-child]:flex-nowrap"
    >
      <Button variant="outline" type="button" :disabled="busy" @click="emit('cancel')">{{
        t('cancel')
      }}</Button>
      <Button class="flex-1" type="submit" :disabled="busy || !hasBackup"
        ><Spinner v-if="busy" />{{ busy ? t('restoring') : t('continue') }}</Button
      >
    </FormDialogFooter>
  </form>
</template>

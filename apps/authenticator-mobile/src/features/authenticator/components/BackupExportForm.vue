<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { z } from 'zod'

import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import SegmentedCodeInput from '@/components/common/SegmentedCodeInput.vue'
import { Button } from '@/components/ui/button'
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { Spinner } from '@/components/ui/spinner'
import { firstFormError } from '@/lib/form-validation'

const props = defineProps<{ busy: boolean; canExport: boolean }>()
const emit = defineEmits<{ submit: [password: string]; cancel: [] }>()
const { t } = useI18n()
const form = useForm({
  validationSchema: toTypedSchema(
    z
      .object({
        password: z.string().regex(/^\d{6}$/, t('backupPasswordDigits')),
        confirmation: z.string().regex(/^\d{6}$/, t('backupPasswordDigits')),
      })
      .refine((values) => values.password === values.confirmation, {
        path: ['confirmation'],
        message: t('backupPasswordMismatch'),
      })
  ),
  initialValues: { password: '', confirmation: '' },
})

const submit = form.handleSubmit(
  ({ password }) => emit('submit', password),
  ({ errors }) => toast.error(firstFormError(errors, t('formInvalid')))
)
</script>

<template>
  <form class="grid gap-4" autocomplete="off" novalidate @submit.prevent="submit">
    <FormField v-slot="{ componentField }" name="password" :validate-on-blur="false">
      <FormItem>
        <FormLabel>{{ t('backupPassword') }}</FormLabel>
        <FormControl>
          <SegmentedCodeInput
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
    <FormField v-slot="{ componentField }" name="confirmation" :validate-on-blur="false">
      <FormItem>
        <FormLabel>{{ t('backupPasswordConfirm') }}</FormLabel>
        <FormControl>
          <SegmentedCodeInput
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
    <FormDialogFooter
      class="shrink-0 justify-end px-0 pb-0 [&>div:last-child]:w-full [&>div:last-child]:flex-nowrap"
    >
      <Button variant="outline" type="button" :disabled="busy" @click="emit('cancel')">{{
        t('cancel')
      }}</Button>
      <Button class="flex-1" type="submit" :disabled="busy || !canExport"
        ><Spinner v-if="busy" />{{ busy ? t('exporting') : t('createBackup') }}</Button
      >
    </FormDialogFooter>
  </form>
</template>

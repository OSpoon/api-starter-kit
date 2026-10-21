<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { ref } from 'vue'
import { useForm } from 'vee-validate'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import { Button } from '@/components/ui/button'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { firstFormError } from '@/lib/form-validation'

const props = defineProps<{ busy: boolean; canExport: boolean }>()
const emit = defineEmits<{ submit: [password: string]; cancel: [] }>()
const { t } = useI18n()
const submitError = ref('')
const form = useForm({
  validationSchema: toTypedSchema(
    z
      .object({
        password: z.string().min(6, t('backupPasswordShort')).max(256),
        confirmation: z.string().min(1, t('backupPasswordRequired')),
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
  ({ errors }) => (submitError.value = firstFormError(errors, t('formInvalid')))
)
</script>

<template>
  <form class="grid gap-4" autocomplete="off" novalidate @submit.prevent="submit">
    <FormField v-slot="{ componentField }" name="password" :validate-on-blur="false">
      <FormItem>
        <FormLabel>{{ t('backupPassword') }}</FormLabel>
        <FormControl
          ><Input
            v-bind="componentField"
            type="password"
            autocomplete="new-password"
            maxlength="256"
        /></FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="confirmation" :validate-on-blur="false">
      <FormItem>
        <FormLabel>{{ t('backupPasswordConfirm') }}</FormLabel>
        <FormControl
          ><Input
            v-bind="componentField"
            type="password"
            autocomplete="new-password"
            maxlength="256"
        /></FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <Alert v-if="submitError" variant="destructive" role="status" aria-live="polite" class="py-2.5">
      <AlertDescription>{{ submitError }}</AlertDescription>
    </Alert>
    <FormDialogFooter class="shrink-0 justify-end">
      <Button variant="outline" type="button" :disabled="busy" @click="emit('cancel')">{{
        t('cancel')
      }}</Button>
      <Button type="submit" :disabled="busy || !canExport"
        ><Spinner v-if="busy" />{{ busy ? t('exporting') : t('createBackup') }}</Button
      >
    </FormDialogFooter>
  </form>
</template>

<script setup lang="ts">
import { Eye, EyeOff } from '@lucide/vue'
import { toTypedSchema } from '@vee-validate/zod'
import { computed, ref, watch } from 'vue'
import { useForm } from 'vee-validate'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import { Dialog } from '@/components/ui/dialog'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { firstFormError } from '@/lib/form-validation'
import { isValidSecret, normalizeSecret } from '../services/totp'
import type { TotpAccount } from '../services/totp'

type AccountFormValues = {
  issuer: string
  name: string
  secret: string
}

const props = defineProps<{
  editingAccount: TotpAccount | null
  busy: boolean
  vaultReady: boolean
}>()
const emit = defineEmits<{ save: [account: TotpAccount] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const revealSecret = ref(false)

const validationSchema = computed(() =>
  toTypedSchema(
    z
      .object({
        issuer: z.string().trim().min(1, t('issuerRequired')).max(80),
        name: z.string().trim().min(1, t('accountRequired')).max(120),
        secret: z.string().trim(),
      })
      .superRefine((values, context) => {
        if (!values.secret && !props.editingAccount) {
          context.addIssue({ code: 'custom', path: ['secret'], message: t('secretRequired') })
        } else if (values.secret && !isValidSecret(values.secret)) {
          context.addIssue({ code: 'custom', path: ['secret'], message: t('secretInvalid') })
        }
      })
  )
)

const form = useForm<AccountFormValues>({
  validationSchema,
  initialValues: { issuer: '', name: '', secret: '' },
})

watch([open, () => props.editingAccount], ([isOpen]) => {
  if (!isOpen) return
  const account = props.editingAccount
  revealSecret.value = false
  form.resetForm({
    values: account
      ? {
          issuer: account.issuer || account.name,
          name: account.name,
          secret: '',
        }
      : { issuer: '', name: '', secret: '' },
  })
})

const submitForm = form.handleSubmit(
  (values) => {
    const existing = props.editingAccount
    emit('save', {
      id: existing?.id || crypto.randomUUID(),
      issuer: values.issuer.trim(),
      name: values.name.trim(),
      secret: normalizeSecret(values.secret || existing?.secret || ''),
      algorithm: existing?.algorithm ?? 'SHA1',
      digits: existing?.digits ?? 6,
      period: existing?.period ?? 30,
    })
  },
  ({ errors }) => {
    toast.error(firstFormError(errors, t('formInvalid')))
  }
)
</script>

<template>
  <Dialog v-model:open="open">
    <FormDialogContent
      :title="t(editingAccount ? 'edit' : 'manualTitle')"
      :description="t('manualDescription')"
      class="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-hidden sm:max-w-xl"
    >
      <form
        class="flex min-h-0 flex-1 flex-col overflow-hidden"
        autocomplete="off"
        novalidate
        @submit.prevent="submitForm"
      >
        <div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pb-6">
          <div class="grid items-start gap-4">
            <FormField v-slot="{ componentField }" name="issuer" :validate-on-blur="false">
              <FormItem>
                <FormLabel>{{ t('issuerLabel') }}</FormLabel>
                <FormControl>
                  <Input
                    v-bind="componentField"
                    type="text"
                    maxlength="80"
                    autocomplete="off"
                    :placeholder="t('issuerPlaceholder')"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="name" :validate-on-blur="false">
              <FormItem>
                <FormLabel>{{ t('accountLabel') }}</FormLabel>
                <FormControl>
                  <Input
                    v-bind="componentField"
                    type="text"
                    maxlength="120"
                    autocomplete="off"
                    :placeholder="t('accountPlaceholder')"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="secret" :validate-on-blur="false">
              <FormItem>
                <FormLabel>{{ t('secretLabel') }}</FormLabel>
                <div class="relative">
                  <FormControl>
                    <Input
                      v-bind="componentField"
                      :type="revealSecret ? 'text' : 'password'"
                      class="pr-12"
                      autocomplete="off"
                      autocapitalize="characters"
                      spellcheck="false"
                      :placeholder="editingAccount ? t('secretEditHint') : t('secretPlaceholder')"
                    />
                  </FormControl>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="absolute top-1/2 right-1 -translate-y-1/2"
                    type="button"
                    :aria-label="t(revealSecret ? 'hideSecret' : 'showSecret')"
                    :title="t(revealSecret ? 'hideSecret' : 'showSecret')"
                    @click="revealSecret = !revealSecret"
                  >
                    <EyeOff v-if="revealSecret" :size="18" />
                    <Eye v-else :size="18" />
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            </FormField>
          </div>
        </div>
        <FormDialogFooter class="shrink-0 justify-end">
          <Button variant="outline" type="button" :disabled="busy" @click="open = false">{{
            t('cancel')
          }}</Button>
          <Button type="submit" :disabled="busy || !vaultReady"
            ><Spinner v-if="busy" />{{ busy ? t('loading') : t('save') }}</Button
          >
        </FormDialogFooter>
      </form>
    </FormDialogContent>
  </Dialog>
</template>

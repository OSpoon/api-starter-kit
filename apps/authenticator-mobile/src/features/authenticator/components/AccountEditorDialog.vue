<script setup lang="ts">
import { ChevronDown, Eye, EyeOff } from '@lucide/vue'
import { toTypedSchema } from '@vee-validate/zod'
import { computed, ref, watch } from 'vue'
import { useForm } from 'vee-validate'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import { Dialog } from '@/components/ui/dialog'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { firstFormError } from '@/lib/form-validation'
import { isValidSecret, normalizeSecret } from '../services/totp'
import type { TotpAccount } from '../services/totp'

type Notice = { key: string; tone: 'success' | 'error' | 'info' } | null
type AccountFormValues = {
  issuer: string
  name: string
  secret: string
  algorithm: TotpAccount['algorithm']
  digits: '6' | '8'
  period: string
}

const props = defineProps<{
  editingAccount: TotpAccount | null
  notice: Notice
  busy: boolean
  vaultReady: boolean
}>()
const emit = defineEmits<{ save: [account: TotpAccount] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const advancedOpen = ref(false)
const revealSecret = ref(false)
const submitError = ref('')

const validationSchema = computed(() =>
  toTypedSchema(
    z
      .object({
        issuer: z.string().trim().min(1, t('issuerRequired')).max(80),
        name: z.string().trim().min(1, t('accountRequired')).max(120),
        secret: z.string().trim(),
        algorithm: z.enum(['SHA1', 'SHA256', 'SHA512']),
        digits: z.enum(['6', '8']),
        period: z
          .string()
          .trim()
          .refine((value) => {
            const period = Number(value)
            return Number.isInteger(period) && period >= 1 && period <= 86400
          }, t('periodInvalid')),
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
  initialValues: { issuer: '', name: '', secret: '', algorithm: 'SHA1', digits: '6', period: '30' },
})

watch([open, () => props.editingAccount], ([isOpen]) => {
  if (!isOpen) return
  const account = props.editingAccount
  submitError.value = ''
  advancedOpen.value = false
  revealSecret.value = false
  form.resetForm({
    values: account
      ? {
          issuer: account.issuer || account.name,
          name: account.name,
          secret: '',
          algorithm: account.algorithm,
          digits: String(account.digits) as '6' | '8',
          period: String(account.period),
        }
      : { issuer: '', name: '', secret: '', algorithm: 'SHA1', digits: '6', period: '30' },
  })
})

watch(form.errors, () => {
  submitError.value = ''
})

const submitForm = form.handleSubmit(
  (values) => {
    const existing = props.editingAccount
    emit('save', {
      id: existing?.id || crypto.randomUUID(),
      issuer: values.issuer.trim(),
      name: values.name.trim(),
      secret: normalizeSecret(values.secret || existing?.secret || ''),
      algorithm: values.algorithm,
      digits: Number(values.digits) as TotpAccount['digits'],
      period: Number(values.period),
    })
  },
  ({ errors }) => {
    submitError.value = firstFormError(errors, t('formInvalid'))
  }
)
</script>

<template>
  <Dialog v-model:open="open">
    <FormDialogContent
      :title="t(editingAccount ? 'edit' : 'manualTitle')"
      :description="t('manualDescription')"
      class="max-h-[90dvh] max-w-xl overflow-hidden"
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
            <Collapsible v-model:open="advancedOpen" class="rounded-lg border px-3">
              <CollapsibleTrigger as-child>
                <Button variant="ghost" class="w-full justify-between px-1 text-left">
                  {{ t('advancedSettings') }}
                  <ChevronDown :size="17" :class="advancedOpen ? 'rotate-180' : ''" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent class="grid gap-4 pb-4 pt-2 sm:grid-cols-2">
                <FormField v-slot="{ componentField }" name="algorithm" :validate-on-blur="false">
                  <FormItem>
                    <FormLabel>{{ t('algorithmLabel') }}</FormLabel>
                    <Select v-bind="componentField">
                      <FormControl
                        ><SelectTrigger class="w-full"><SelectValue /></SelectTrigger
                      ></FormControl>
                      <SelectContent>
                        <SelectItem value="SHA1">SHA1</SelectItem>
                        <SelectItem value="SHA256">SHA256</SelectItem>
                        <SelectItem value="SHA512">SHA512</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                </FormField>
                <FormField v-slot="{ componentField }" name="digits" :validate-on-blur="false">
                  <FormItem>
                    <FormLabel>{{ t('digitsLabel') }}</FormLabel>
                    <Select v-bind="componentField">
                      <FormControl
                        ><SelectTrigger class="w-full"><SelectValue /></SelectTrigger
                      ></FormControl>
                      <SelectContent>
                        <SelectItem value="6">6</SelectItem>
                        <SelectItem value="8">8</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                </FormField>
                <FormField v-slot="{ componentField }" name="period" :validate-on-blur="false">
                  <FormItem class="sm:col-span-2">
                    <FormLabel>{{ t('periodLabel') }}</FormLabel>
                    <div class="relative">
                      <FormControl>
                        <Input
                          v-bind="componentField"
                          type="number"
                          min="1"
                          max="86400"
                          step="1"
                          class="pr-16"
                        />
                      </FormControl>
                      <span
                        class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
                      >
                        {{ t('secondsUnit') }}
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                </FormField>
              </CollapsibleContent>
            </Collapsible>
            <Alert
              v-if="submitError"
              variant="destructive"
              role="status"
              aria-live="polite"
              class="py-2.5"
            >
              <AlertDescription>{{ submitError }}</AlertDescription>
            </Alert>
            <Alert
              v-if="notice"
              :variant="notice.tone === 'error' ? 'destructive' : 'default'"
              role="status"
              aria-live="polite"
              class="py-2.5"
            >
              <AlertDescription>{{ t(notice.key) }}</AlertDescription>
            </Alert>
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

<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import type { Composer } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { z } from 'zod'

import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import { Button } from '@/components/ui/button'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { firstFormError } from '@/lib/form-validation'

import type { ImBot, ImBotChannel, ImBotInput } from './api'

const props = defineProps<{
  open: boolean
  saving: boolean
  bot: ImBot | null
}>()

const emit = defineEmits<{
  save: [values: ImBotInput]
  cancel: []
}>()

const { t } = useI18n()

function createSchema(translate: Composer['t']) {
  return z
    .object({
      name: z.string().trim().max(160),
      channel: z.enum(['wecom', 'feishu', 'dingtalk']),
      identifier: z.string().trim().max(160),
      secret: z.string().trim(),
      tenantId: z.string().trim(),
      endpoint: z.string().trim(),
      cardTemplateId: z.string().trim(),
      streamingCardTemplateId: z.string().trim(),
    })
    .superRefine((values, context) => {
      if (!props.bot && !values.name) {
        context.addIssue({
          code: 'custom',
          path: ['name'],
          message: translate('im_config.validation.name_required'),
        })
      }
      if (!props.bot && !values.identifier) {
        context.addIssue({
          code: 'custom',
          path: ['identifier'],
          message: translate('im_config.validation.identifier_required'),
        })
      }
      if (!props.bot && !values.secret) {
        context.addIssue({
          code: 'custom',
          path: ['secret'],
          message: translate('im_config.validation.secret_required'),
        })
      }
      if (!props.bot && values.channel === 'wecom' && !values.tenantId) {
        context.addIssue({
          code: 'custom',
          path: ['tenantId'],
          message: translate('im_config.validation.tenant_required'),
        })
      }
    })
}

const validationSchema = computed(() => toTypedSchema(createSchema(t)))
const form = useForm({
  validationSchema,
  initialValues: {
    name: '',
    channel: 'wecom' as ImBotChannel,
    identifier: '',
    secret: '',
    tenantId: '',
    endpoint: '',
    cardTemplateId: '',
    streamingCardTemplateId: '',
  },
})

watch(
  () => [props.open, props.bot] as const,
  ([isOpen, bot]) => {
    if (!isOpen) return
    form.resetForm({
      values: {
        name: bot?.name ?? '',
        channel: bot?.channel ?? 'wecom',
        identifier: bot?.identifier ?? '',
        secret: '',
        tenantId: bot?.tenantId ?? '',
        endpoint: bot?.endpoint ?? '',
        cardTemplateId: bot?.cardTemplateId ?? '',
        streamingCardTemplateId: bot?.streamingCardTemplateId ?? '',
      },
    })
  },
  { immediate: true }
)

function onInvalidSubmit({ errors }: { errors: Record<string, string | undefined> }) {
  toast.error(firstFormError(errors, t('common.form_check_errors')))
}

const onSubmit = form.handleSubmit((values) => {
  emit('save', {
    name: values.name,
    channel: props.bot ? undefined : values.channel,
    identifier: values.identifier,
    secret: values.secret || undefined,
    tenantId: values.channel === 'wecom' ? values.tenantId : undefined,
    endpoint: values.channel === 'dingtalk' ? undefined : values.endpoint,
    cardTemplateId: values.channel === 'dingtalk' ? values.cardTemplateId : undefined,
    streamingCardTemplateId:
      values.channel === 'dingtalk' ? values.streamingCardTemplateId : undefined,
  })
}, onInvalidSubmit)
</script>

<template>
  <form class="flex min-h-0 flex-1 flex-col overflow-hidden" novalidate @submit="onSubmit">
    <div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pt-1 pb-6">
      <div class="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <div class="min-w-0">
          <FormField v-slot="{ componentField }" name="name" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('im_config.name') }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  :placeholder="
                    bot ? t('im_config.keep_existing_optional') : t('im_config.name_placeholder')
                  "
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>

        <div class="min-w-0">
          <FormField v-slot="{ componentField }" name="channel" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('im_config.platform') }}</FormLabel>
              <Select v-bind="componentField" :disabled="Boolean(bot)">
                <FormControl>
                  <SelectTrigger class="w-full">
                    <SelectValue :placeholder="t('im_config.platform')" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="wecom">{{ t('im_config.wecom') }}</SelectItem>
                  <SelectItem value="dingtalk">{{ t('im_config.dingtalk') }}</SelectItem>
                  <SelectItem value="feishu">{{ t('im_config.feishu') }}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>

        <div class="min-w-0 md:col-span-2">
          <FormField v-slot="{ componentField }" name="identifier" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t(`im_config.${form.values.channel}_identifier`) }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  autocomplete="off"
                  :placeholder="
                    bot
                      ? t('im_config.keep_existing_optional')
                      : t(`im_config.${form.values.channel}_identifier_placeholder`)
                  "
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>

        <div class="min-w-0 md:col-span-2">
          <FormField v-slot="{ componentField }" name="secret" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t(`im_config.${form.values.channel}_secret`) }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  type="password"
                  autocomplete="new-password"
                  :placeholder="
                    bot
                      ? t('im_config.keep_existing')
                      : t(`im_config.${form.values.channel}_secret_placeholder`)
                  "
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>

        <div v-if="form.values.channel === 'wecom'" class="min-w-0 md:col-span-2">
          <FormField v-slot="{ componentField }" name="tenantId" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('im_config.wecom_tenant_id') }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  :placeholder="
                    bot
                      ? t('im_config.keep_existing_optional')
                      : t('im_config.wecom_tenant_id_placeholder')
                  "
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>

        <div v-if="form.values.channel !== 'dingtalk'" class="min-w-0 md:col-span-2">
          <FormField v-slot="{ componentField }" name="endpoint" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t(`im_config.${form.values.channel}_endpoint`) }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  :placeholder="
                    bot
                      ? t('im_config.keep_existing_optional')
                      : t(`im_config.${form.values.channel}_endpoint_placeholder`)
                  "
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>

        <div v-if="form.values.channel === 'dingtalk'" class="min-w-0 md:col-span-2">
          <FormField v-slot="{ componentField }" name="cardTemplateId" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('im_config.dingtalk_card_template_id') }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  :placeholder="
                    bot
                      ? t('im_config.keep_existing_optional')
                      : t('im_config.dingtalk_card_template_id_placeholder')
                  "
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>

        <div v-if="form.values.channel === 'dingtalk'" class="min-w-0 md:col-span-2">
          <FormField
            v-slot="{ componentField }"
            name="streamingCardTemplateId"
            :validate-on-blur="false"
          >
            <FormItem>
              <FormLabel>{{ t('im_config.dingtalk_streaming_card_template_id') }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  :placeholder="
                    bot
                      ? t('im_config.keep_existing_optional')
                      : t('im_config.dingtalk_streaming_card_template_id_placeholder')
                  "
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>
      </div>
    </div>

    <FormDialogFooter class="shrink-0">
      <Button type="button" variant="outline" :disabled="saving" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </Button>
      <Button type="submit" :disabled="saving">
        {{ saving ? t('common.saving') : t('common.save') }}
      </Button>
    </FormDialogFooter>
  </form>
</template>

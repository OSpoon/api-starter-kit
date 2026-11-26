<script setup lang="ts">
import 'cronstrue/locales/zh_CN'

import { toTypedSchema } from '@vee-validate/zod'
import { useDebounceFn } from '@vueuse/core'
import cronstrue from 'cronstrue'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import { z } from 'zod'

import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  type AiAutomation,
  type AiAutomationInput,
  previewAiAutomationSchedule,
} from '@/features/ai-automations/api'
import { firstFormError } from '@/lib/form-validation'

const props = defineProps<{
  automation: AiAutomation | null
  saving: boolean
  token: string | null
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ save: [input: AiAutomationInput & { enabled: boolean }] }>()
const { t, locale } = useI18n()
const previewTimes = ref<string[]>([])
const previewState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
let previewRequestId = 0

type FormValues = {
  name: string
  prompt: string
  cron: string
  webhookType: 'generic' | 'wecom'
  webhookUrl: string
}

const schema = computed(() =>
  toTypedSchema(
    z.object({
      name: z.string().trim().min(1, t('ai_automations.validation.name')).max(120),
      prompt: z.string().trim().min(1, t('ai_automations.validation.prompt')).max(8_000),
      cron: z
        .string()
        .trim()
        .min(1, t('ai_automations.validation.cron'))
        .max(120, t('ai_automations.validation.cron')),
      webhookType: z.enum(['generic', 'wecom']),
      webhookUrl: props.automation
        ? z.string().max(2_048)
        : z.string().trim().min(1, t('ai_automations.validation.webhook')).max(2_048),
    })
  )
)

const form = useForm<FormValues>({
  validationSchema: schema,
  initialValues: {
    name: '',
    prompt: '',
    cron: '0 9 * * 1-5',
    webhookType: 'generic',
    webhookUrl: '',
  },
})

const cronDescription = computed(() => {
  const expression = form.values.cron.trim()
  if (!expression) return ''
  try {
    return cronstrue.toString(expression, {
      locale: locale.value.startsWith('zh') ? 'zh_CN' : 'en',
      use24HourTimeFormat: true,
      dayOfWeekStartIndexZero: false,
    })
  } catch {
    return ''
  }
})

const loadPreview = useDebounceFn(async (cron: string, requestId: number) => {
  if (requestId !== previewRequestId) return
  try {
    const preview = await previewAiAutomationSchedule(props.token, cron)
    if (requestId !== previewRequestId) return
    previewTimes.value = preview.times
    previewState.value = 'ready'
  } catch {
    if (requestId === previewRequestId) previewState.value = 'error'
  }
}, 300)

watch(
  () => [open.value, props.automation] as const,
  ([isOpen, automation]) => {
    if (!isOpen) return
    form.resetForm({
      values: {
        name: automation?.name ?? '',
        prompt: automation?.prompt ?? '',
        cron: automation ? (automation.schedule.cron ?? '') : '0 9 * * 1-5',
        webhookType: automation?.webhookType ?? 'generic',
        webhookUrl: automation?.webhookUrl ?? '',
      },
    })
  },
  { immediate: true }
)

watch(
  () => [open.value, form.values.cron, props.token] as const,
  ([isOpen, cron]) => {
    const requestId = ++previewRequestId
    previewTimes.value = []
    if (!isOpen || !cron.trim()) {
      previewState.value = 'idle'
      return
    }
    previewState.value = 'loading'
    void loadPreview(cron, requestId)
  }
)

function onInvalidSubmit({ errors }: { errors: Record<string, string | undefined> }) {
  toast.error(firstFormError(errors, t('common.form_check_errors')))
}

const onSubmit = form.handleSubmit((values) => {
  emit('save', {
    name: values.name.trim(),
    prompt: values.prompt.trim(),
    schedule: { cron: values.cron.trim() },
    webhookType: values.webhookType,
    ...(values.webhookUrl.trim() ? { webhookUrl: values.webhookUrl.trim() } : {}),
    enabled: props.automation?.enabled ?? true,
  })
}, onInvalidSubmit)
</script>

<template>
  <FormDialogContent
    :title="automation ? t('ai_automations.edit') : t('ai_automations.create')"
    :description="t('ai_automations.form_description')"
    class="sm:max-w-2xl"
  >
    <form class="flex min-h-0 flex-1 flex-col overflow-hidden" novalidate @submit="onSubmit">
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="grid gap-4 px-6 pb-6">
          <FormField v-slot="{ componentField }" name="name" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('ai_automations.name') }}</FormLabel>
              <FormControl><Input v-bind="componentField" /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="prompt" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('ai_automations.prompt') }}</FormLabel>
              <FormControl><Textarea v-bind="componentField" rows="5" /></FormControl>
              <FormDescription>{{ t('ai_automations.prompt_hint') }}</FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="cron" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('ai_automations.cron') }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  class="font-mono"
                  autocomplete="off"
                  spellcheck="false"
                />
              </FormControl>
              <FormDescription v-if="automation && !automation.schedule.cron">
                {{ t('ai_automations.legacy_schedule_hint') }}
              </FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>
          <div
            v-if="cronDescription || previewState === 'loading' || previewState === 'error'"
            class="space-y-1 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <p v-if="cronDescription">{{ cronDescription }}</p>
            <p v-if="previewState === 'loading'">
              {{ t('ai_automations.preview_loading') }}
            </p>
            <p v-else-if="previewState === 'error'" class="text-destructive">
              {{ t('ai_automations.preview_error') }}
            </p>
            <ul v-else-if="previewState === 'ready'" class="space-y-0.5">
              <li v-for="(time, index) in previewTimes" :key="time">
                {{
                  t(index === 0 ? 'ai_automations.preview_next' : 'ai_automations.preview_then', {
                    time,
                  })
                }}
              </li>
            </ul>
          </div>
          <FormField v-slot="{ componentField }" name="webhookType" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('ai_automations.webhook_type') }}</FormLabel>
              <Select v-bind="componentField">
                <FormControl>
                  <SelectTrigger class="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="generic">{{
                    t('ai_automations.webhook_type_generic')
                  }}</SelectItem>
                  <SelectItem value="wecom">{{
                    t('ai_automations.webhook_type_wecom')
                  }}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="webhookUrl" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('ai_automations.webhook') }}</FormLabel>
              <FormControl
                ><Input v-bind="componentField" type="url" autocomplete="url"
              /></FormControl>
              <FormDescription>
                {{
                  automation?.webhookConfigured
                    ? t('ai_automations.webhook_keep_hint')
                    : t(
                        form.values.webhookType === 'wecom'
                          ? 'ai_automations.webhook_wecom_hint'
                          : 'ai_automations.webhook_hint'
                      )
                }}
              </FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>
      </div>
      <FormDialogFooter>
        <Button type="button" variant="outline" :disabled="saving" @click="open = false">
          {{ t('common.cancel') }}
        </Button>
        <Button type="submit" :disabled="saving">
          {{ saving ? t('common.saving') : t('common.save') }}
        </Button>
      </FormDialogFooter>
    </form>
  </FormDialogContent>
</template>

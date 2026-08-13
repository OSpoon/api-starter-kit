<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import type { Composer } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { z } from 'zod'

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
import { firstFormError } from '@/lib/form-validation'

import type {
  WecomMessageTemplate,
  WecomMessageType,
  WecomTemplateInput,
  WecomTemplateParameter,
} from '../types'
import WecomMessageVisualEditor from './WecomMessageVisualEditor.vue'

const props = defineProps<{
  open?: boolean
  saving?: boolean
  template?: WecomMessageTemplate | null
}>()
const emit = defineEmits<{
  save: [input: WecomTemplateInput]
  cancel: []
}>()
const { t } = useI18n()
const wecomMessageDocsUrl = 'https://developer.work.weixin.qq.com/document/path/99110'
const msgtype = ref<WecomMessageType>('text')
const enabled = ref(true)
const payloadText = ref('')
const parameters = ref<WecomTemplateParameter[]>([])
const jsonError = ref('')
const visualPayload = ref<Record<string, unknown>>({})

function createSchema(translate: Composer['t'], editing: boolean) {
  const emptyString = (schema: z.ZodType<string>) =>
    z
      .string()
      .optional()
      .transform((value) => value ?? '')
      .pipe(schema)

  return z.object({
    name: emptyString(
      z
        .string()
        .trim()
        .min(1, translate('wecom_templates.validation.name_required'))
        .max(120, translate('wecom_templates.validation.name_max'))
    ),
    description: emptyString(
      z.string().trim().max(500, translate('wecom_templates.validation.description_max'))
    ),
    msgtype: z.enum(['text', 'markdown', 'markdown_v2']).catch('text'),
    webhookUrl: emptyString(
      z
        .string()
        .trim()
        .superRefine((value, context) => {
          if (!value && editing) return
          if (!value) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: translate('wecom_templates.validation.webhook_required'),
            })
            return
          }
          try {
            const url = new URL(value)
            if (
              url.protocol !== 'https:' ||
              url.hostname !== 'qyapi.weixin.qq.com' ||
              url.pathname !== '/cgi-bin/webhook/send' ||
              !url.searchParams.get('key')
            )
              throw new Error()
          } catch {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: translate('wecom_templates.validation.webhook_invalid'),
            })
          }
        })
    ),
  })
}

const formSchema = computed(() => toTypedSchema(createSchema(t, Boolean(props.template))))
const form = useForm({
  validationSchema: formSchema,
  keepValuesOnUnmount: true,
  initialValues: {
    name: '',
    description: '',
    msgtype: 'text' as WecomMessageType,
    webhookUrl: '',
  },
})
const examples: Record<WecomMessageType, Record<string, unknown>> = {
  text: {
    msgtype: 'text',
    text: {
      content: '{{region}}今日天气：{{temperature}}度，大部分多云，降雨概率：{{probability}}%',
    },
  },
  markdown: {
    msgtype: 'markdown',
    markdown: {
      content: [
        '**实时新增用户反馈：**<font color="warning">{{total_count}}例</font>，请相关同事注意。',
        '> 类型：<font color="comment">用户反馈</font>',
        '> 普通用户反馈：<font color="comment">{{normal_count}}例</font>',
        '> VIP用户反馈：<font color="info">{{vip_count}}例</font>',
        '> 负责人：<@{{owner_userid}}>',
      ].join('\n'),
    },
  },
  markdown_v2: {
    msgtype: 'markdown_v2',
    markdown_v2: {
      content: [
        '# 一、标题',
        '## 二级标题',
        '### 三级标题',
        '# 二、字体',
        '*斜体*',
        '',
        '**加粗**',
        '# 三、列表',
        '- 无序列表 1',
        '- 无序列表 2',
        '  - 无序列表 2.1',
        '  - 无序列表 2.2',
        '1. 有序列表 1',
        '2. 有序列表 2',
        '# 四、引用',
        '> 一级引用',
        '>>二级引用',
        '>>>三级引用',
        '# 五、链接',
        '[这是一个链接](https://work.weixin.qq.com/api/doc)',
        '![](https://res.mail.qq.com/node/ww/wwopenmng/images/independent/doc/test_pic_msg1.png)',
        '# 六、分割线',
        '',
        '---',
        '# 七、代码',
        '`这是行内代码`',
        '```',
        '这是独立代码块',
        '```',
        '',
        '# 八、表格',
        '| 姓名 | 文化衫尺寸 | 收货地址 |',
        '| :----- | :----: | -------: |',
        '| 张三 | S | 广州 |',
        '| 李四 | L | 深圳 |',
      ].join('\n'),
    },
  },
}

function exampleParameters(payload: Record<string, unknown>) {
  const names = new Set<string>()
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) names.add(match[1]!)
    } else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  visit(payload)
  return [...names].map((name) => ({
    name,
    type: 'string' as const,
    required: true,
    description: null,
    maxBytes: null,
  }))
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    msgtype.value = props.template?.msgtype ?? 'text'
    const initialPayload = templatePayload(props.template?.payload ?? examples[msgtype.value])
    form.resetForm({
      values: {
        name: props.template?.name ?? '',
        description: props.template?.description ?? '',
        msgtype: props.template?.msgtype ?? 'text',
        webhookUrl: '',
      },
    })
    enabled.value = props.template?.enabled ?? true
    payloadText.value = JSON.stringify(initialPayload, null, 2)
    visualPayload.value = JSON.parse(JSON.stringify(initialPayload))
    parameters.value = exampleParameters(initialPayload)
    jsonError.value = ''
  },
  { immediate: true }
)
watch(msgtype, (type) => {
  form.setFieldValue('msgtype', type)
  if (!props.template) {
    payloadText.value = JSON.stringify(examples[type], null, 2)
    visualPayload.value = JSON.parse(JSON.stringify(examples[type]))
    syncParametersFromPayload(examples[type])
  }
})
function updateVisualPayload(value: Record<string, unknown>) {
  visualPayload.value = value
  payloadText.value = JSON.stringify(value, null, 2)
  syncParametersFromPayload(value)
}
function placeholderNames(value: unknown, names = new Set<string>()) {
  if (typeof value === 'string')
    for (const match of value.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) names.add(match[1]!)
  else if (Array.isArray(value)) value.forEach((item) => placeholderNames(item, names))
  else if (value && typeof value === 'object')
    Object.values(value).forEach((item) => placeholderNames(item, names))
  return [...names]
}
function syncParametersFromPayload(value: unknown) {
  const names = placeholderNames(value)
  parameters.value = names.map((name) => ({
    name,
    type: 'string' as const,
    required: true,
    description: null,
    maxBytes: null,
  }))
}
function templatePayload(value: Record<string, unknown>) {
  const payload = JSON.parse(JSON.stringify(value)) as Record<string, unknown>
  if (
    payload.msgtype === 'text' &&
    payload.text &&
    typeof payload.text === 'object' &&
    !Array.isArray(payload.text)
  ) {
    const text = payload.text as Record<string, unknown>
    delete text.mentioned_list
    delete text.mentioned_mobile_list
  }
  return payload
}
function onInvalidSubmit({ errors }: { errors: Record<string, string | undefined> }) {
  toast.error(firstFormError(errors, t('common.form_check_errors')))
}

function submitValues(values: {
  name: string
  description: string
  msgtype: WecomMessageType
  webhookUrl: string
}) {
  try {
    const payload = JSON.parse(payloadText.value) as Record<string, unknown>
    if (payload.msgtype !== values.msgtype)
      throw new Error(t('wecom_templates.validation.msgtype_match'))
    jsonError.value = ''
    emit('save', {
      name: values.name.trim(),
      description: values.description.trim() || null,
      msgtype: values.msgtype,
      webhookUrl: values.webhookUrl.trim() || undefined,
      payload: templatePayload(payload),
      parameters: parameters.value,
      enabled: enabled.value,
    })
  } catch (error) {
    jsonError.value = error instanceof Error ? error.message : t('wecom_templates.validation.json')
  }
}

const onSubmit = form.handleSubmit(submitValues, onInvalidSubmit)
</script>

<template>
  <form class="flex min-h-0 flex-1 flex-col overflow-hidden" novalidate @submit.prevent="onSubmit">
    <div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pb-6">
      <a
        :href="wecomMessageDocsUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="mb-4 inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
      >
        {{ t('wecom_templates.wecom_docs_link') }}
        <ExternalLink class="size-3.5" aria-hidden="true" />
      </a>
      <div class="grid gap-4 sm:grid-cols-4 sm:[&>div:nth-child(n+5)]:col-span-4">
        <div class="sm:col-span-3">
          <FormField v-slot="{ componentField }" name="name" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('wecom_templates.name') }}</FormLabel>
              <FormControl><Input v-bind="componentField" /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>
        <div class="sm:col-span-1">
          <FormField v-slot="{ componentField }" name="msgtype" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('wecom_templates.msgtype') }}</FormLabel>
              <Select
                v-bind="componentField"
                :model-value="msgtype"
                @update:model-value="msgtype = String($event) as WecomMessageType"
              >
                <FormControl
                  ><SelectTrigger class="w-full"><SelectValue /></SelectTrigger
                ></FormControl>
                <SelectContent
                  ><SelectItem v-for="type in Object.keys(examples)" :key="type" :value="type">{{
                    t(`wecom_templates.types.${type}`)
                  }}</SelectItem></SelectContent
                >
              </Select>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>
        <div class="sm:col-span-4">
          <FormField v-slot="{ componentField }" name="description" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('wecom_templates.description') }}</FormLabel>
              <FormControl><Input v-bind="componentField" /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>
        <div class="sm:col-span-4">
          <FormField v-slot="{ componentField }" name="webhookUrl" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('wecom_templates.webhook') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  type="url"
                  :placeholder="
                    template
                      ? t('wecom_templates.webhook_keep')
                      : 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...'
                  "
              /></FormControl>
              <FormDescription>{{ t('wecom_templates.webhook_hint') }}</FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>
        <div class="min-w-0 space-y-2 sm:col-span-4">
          <WecomMessageVisualEditor
            :msgtype="msgtype"
            :model-value="visualPayload"
            @update:model-value="updateVisualPayload"
          />
          <p v-if="jsonError" class="text-sm text-destructive">{{ jsonError }}</p>
        </div>
      </div>
    </div>
    <FormDialogFooter>
      <Button type="button" variant="outline" :disabled="saving" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </Button>
      <Button type="submit" :disabled="saving">{{ t('common.save') }}</Button>
    </FormDialogFooter>
  </form>
</template>

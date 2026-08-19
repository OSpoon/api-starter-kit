import { toast } from 'vue-sonner'

import { testWecomTemplate } from '../api'
import type { WecomMessageTemplate } from '../types'

export function useWecomTemplateTest(
  token: () => string | null,
  translate: (key: string, params?: Record<string, unknown>) => string
) {
  const testOpen = ref(false)
  const testConfirmOpen = ref(false)
  const testing = ref(false)
  const testTemplate = ref<WecomMessageTemplate | null>(null)
  const mentionedList = ref<string[]>([])
  const mentionedMobileList = ref<string[]>([])
  const testParamsText = ref('{}')
  const pendingTestParams = ref<Record<string, unknown>>({})
  const pendingMentionedList = ref<string[]>([])
  const pendingMentionedMobileList = ref<string[]>([])
  const renderedTestPayload = ref('{}')
  const testParameters = computed(() => testTemplate.value?.parameters ?? [])
  const testParamsSyntaxValid = computed(() => {
    try {
      const parsed = JSON.parse(testParamsText.value)
      return Boolean(parsed && !Array.isArray(parsed) && typeof parsed === 'object')
    } catch {
      return false
    }
  })

  function open(template: WecomMessageTemplate) {
    testTemplate.value = template
    testParamsText.value = JSON.stringify(
      Object.fromEntries(template.parameters.map((parameter) => [parameter.name, ''])),
      null,
      2
    )
    mentionedList.value = []
    mentionedMobileList.value = []
    testOpen.value = true
  }

  function renderTemplateValue(value: unknown, params: Record<string, unknown>): unknown {
    if (typeof value === 'string') {
      return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => String(params[key] ?? ''))
    }
    if (Array.isArray(value)) return value.map((item) => renderTemplateValue(item, params))
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, renderTemplateValue(item, params)])
      )
    }
    return value
  }

  async function confirm() {
    if (!testTemplate.value) return
    let params: Record<string, unknown>
    try {
      const parsed = JSON.parse(testParamsText.value)
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('invalid')
      params = parsed as Record<string, unknown>
    } catch {
      toast.error(translate('wecom_templates.validation.json'))
      return
    }
    const missing = testParameters.value.find(
      (parameter) => parameter.required && !String(params[parameter.name] ?? '').trim()
    )
    if (missing) {
      toast.error(
        translate('wecom_templates.validation.test_parameter_required', { name: missing.name })
      )
      return
    }
    pendingTestParams.value = params
    pendingMentionedList.value = [...mentionedList.value]
    pendingMentionedMobileList.value = [...mentionedMobileList.value]
    const rendered = renderTemplateValue(testTemplate.value.payload, params)
    if (rendered && typeof rendered === 'object' && !Array.isArray(rendered)) {
      const renderedPayload = rendered as Record<string, unknown>
      if (
        testTemplate.value.msgtype === 'text' &&
        renderedPayload.text &&
        typeof renderedPayload.text === 'object'
      ) {
        renderedPayload.text = {
          ...(renderedPayload.text as Record<string, unknown>),
          mentioned_list: pendingMentionedList.value,
          mentioned_mobile_list: pendingMentionedMobileList.value,
        }
      }
    }
    renderedTestPayload.value = JSON.stringify(rendered, null, 2)
    testConfirmOpen.value = true
  }

  async function sendConfirmed() {
    if (!testTemplate.value) return
    testing.value = true
    try {
      await testWecomTemplate(token(), testTemplate.value.id, pendingTestParams.value, {
        mentioned_list: pendingMentionedList.value,
        mentioned_mobile_list: pendingMentionedMobileList.value,
      })
      testConfirmOpen.value = false
      toast.success(translate('wecom_templates.test_success'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : translate('wecom_templates.test_failed'))
    } finally {
      testing.value = false
    }
  }

  return {
    mentionedList,
    mentionedMobileList,
    open,
    renderedTestPayload,
    sendConfirmed,
    testConfirmOpen,
    testOpen,
    testParameters,
    testParamsSyntaxValid,
    testParamsText,
    testTemplate,
    testing,
    confirm,
  }
}

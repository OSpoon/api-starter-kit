<script setup lang="ts">
import { json } from '@codemirror/lang-json'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import { z } from 'zod'

import CodeEditor from '@/components/common/CodeEditor.vue'
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import { Button } from '@/components/ui/button'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { AiEvaluationCase, AiEvaluationCaseInput } from '@/features/ai-evaluations/api'
import { firstFormError } from '@/lib/form-validation'

const props = defineProps<{
  evaluationCase: AiEvaluationCase | null
  saving: boolean
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ save: [input: AiEvaluationCaseInput] }>()
const { t } = useI18n()

const schema = computed(() =>
  toTypedSchema(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, t('ai_evaluations.validation.case_name_required'))
        .max(200, t('ai_evaluations.validation.case_name_max')),
      question: z
        .string()
        .trim()
        .min(1, t('ai_evaluations.validation.question_required'))
        .max(5_000, t('ai_evaluations.validation.question_max')),
      referenceAnswer: z
        .string()
        .trim()
        .min(1, t('ai_evaluations.validation.reference_required'))
        .max(8_000, t('ai_evaluations.validation.reference_max')),
      expectedTools: z.string().max(2_000),
      expectedToolSequence: z.string().max(2_000),
      requiredTerms: z.string().max(2_000),
      forbiddenTerms: z.string().max(2_000),
      mockToolOutputs: z.string().max(16_000),
    })
  )
)
const form = useForm({
  validationSchema: schema,
  initialValues: {
    name: '',
    question: '',
    referenceAnswer: '',
    expectedTools: '',
    expectedToolSequence: '',
    requiredTerms: '',
    forbiddenTerms: '',
    mockToolOutputs: '{}',
  },
})

watch(
  () => [open.value, props.evaluationCase] as const,
  ([isOpen, evaluationCase]) => {
    if (!isOpen) return
    form.resetForm({
      values: {
        name: evaluationCase?.name ?? '',
        question: evaluationCase?.question ?? '',
        referenceAnswer: evaluationCase?.referenceAnswer ?? '',
        expectedTools: evaluationCase?.expectedTools.join('\n') ?? '',
        expectedToolSequence: evaluationCase?.expectedToolSequence.join('\n') ?? '',
        requiredTerms: evaluationCase?.requiredTerms.join('\n') ?? '',
        forbiddenTerms: evaluationCase?.forbiddenTerms.join('\n') ?? '',
        mockToolOutputs: JSON.stringify(evaluationCase?.mockToolOutputs ?? {}, null, 2),
      },
    })
  },
  { immediate: true }
)

function splitLines(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ]
}

function onInvalidSubmit({ errors }: { errors: Record<string, string | undefined> }) {
  toast.error(firstFormError(errors, t('common.form_check_errors')))
}

const onSubmit = form.handleSubmit((values) => {
  let mockToolOutputs: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(values.mockToolOutputs || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
    mockToolOutputs = parsed as Record<string, unknown>
  } catch {
    toast.error(t('ai_evaluations.validation.mock_outputs_json'))
    return
  }
  emit('save', {
    sourceConversationId: props.evaluationCase?.sourceConversationId ?? null,
    name: values.name.trim(),
    question: values.question.trim(),
    referenceAnswer: values.referenceAnswer.trim(),
    expectedTools: splitLines(values.expectedTools),
    expectedToolSequence: splitLines(values.expectedToolSequence),
    requiredTerms: splitLines(values.requiredTerms),
    forbiddenTerms: splitLines(values.forbiddenTerms),
    mockToolOutputs,
  })
}, onInvalidSubmit)
</script>

<template>
  <FormDialogContent
    :title="evaluationCase ? t('ai_evaluations.edit_case') : t('ai_evaluations.create_case')"
    :description="t('ai_evaluations.case_form_description')"
    class="sm:max-w-xl"
  >
    <form class="flex min-h-0 flex-1 flex-col overflow-hidden" novalidate @submit="onSubmit">
      <div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div class="grid gap-4 px-6 pb-6">
          <FormField v-slot="{ componentField }" name="name" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('ai_evaluations.case_name') }}</FormLabel>
              <FormControl><Input v-bind="componentField" /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="question" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('ai_evaluations.question') }}</FormLabel>
              <FormControl><Textarea v-bind="componentField" rows="3" /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="referenceAnswer" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('ai_evaluations.reference_answer') }}</FormLabel>
              <FormControl><Textarea v-bind="componentField" rows="4" /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <p class="text-sm leading-6 text-muted-foreground">
            {{ t('ai_evaluations.scoring_help') }}
          </p>
          <div class="grid gap-4">
            <FormField v-slot="{ componentField }" name="expectedTools" :validate-on-blur="false">
              <FormItem>
                <FormLabel>{{ t('ai_evaluations.expected_tools') }}</FormLabel>
                <FormControl><Textarea v-bind="componentField" rows="3" /></FormControl>
                <p class="text-xs leading-5 text-muted-foreground">
                  {{ t('ai_evaluations.tool_names_help') }}
                </p>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField
              v-slot="{ componentField }"
              name="expectedToolSequence"
              :validate-on-blur="false"
            >
              <FormItem>
                <FormLabel>{{ t('ai_evaluations.expected_tool_sequence') }}</FormLabel>
                <FormControl><Textarea v-bind="componentField" rows="3" /></FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="requiredTerms" :validate-on-blur="false">
              <FormItem>
                <FormLabel>{{ t('ai_evaluations.required_terms') }}</FormLabel>
                <FormControl><Textarea v-bind="componentField" rows="3" /></FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <FormField v-slot="{ componentField }" name="forbiddenTerms" :validate-on-blur="false">
              <FormItem>
                <FormLabel>{{ t('ai_evaluations.forbidden_terms') }}</FormLabel>
                <FormControl><Textarea v-bind="componentField" rows="3" /></FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
          </div>
          <FormField v-slot="{ componentField }" name="mockToolOutputs" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('ai_evaluations.mock_tool_outputs') }}</FormLabel>
              <FormControl>
                <CodeEditor
                  v-bind="componentField"
                  :model-value="String(componentField.modelValue ?? '')"
                  class="h-48 rounded-md border bg-background"
                  :extensions="[json()]"
                  :aria-label="t('ai_evaluations.mock_tool_outputs')"
                />
              </FormControl>
              <p class="text-xs leading-5 text-muted-foreground">
                {{ t('ai_evaluations.mock_outputs_help') }}
              </p>
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

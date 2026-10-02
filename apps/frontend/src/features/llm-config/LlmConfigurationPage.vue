<script setup lang="ts">
import { AudioLines, BrainCircuit, LoaderCircle, Network, Save, TestTube } from '@lucide/vue'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import { z } from 'zod'

import SettingsPageTemplate from '@/components/templates/SettingsPageTemplate.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { firstFormError } from '@/lib/form-validation'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

import {
  getLlmConfiguration,
  type LlmConfiguration,
  testLlmConfiguration,
  updateLlmConfiguration,
} from './api'
import { hasUnsavedLlmConfiguration } from './form-state'

const { t } = useI18n()
const auth = useAuthStore()
const { can } = usePermission()
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const savedConfiguration = ref<LlmConfiguration | null>(null)
const initialValues = {
  chatApiKey: '',
  chatBaseUrl: '',
  chatModel: '',
  chatContextWindow: 128000,
  chatMaxTokens: 16384,
  asrApiKey: '',
  asrBaseUrl: '',
  asrModel: 'Qwen3-ASR-0.6B-4bit',
  embeddingApiKey: '',
  embeddingBaseUrl: '',
  embeddingModel: '',
  embeddingDimensions: 1024,
  requestTimeoutMs: 180000,
}
const formSchema = computed(() =>
  toTypedSchema(
    z
      .object({
        chatApiKey: z.string().max(500, t('llm_config.validation_api_key_max')),
        chatBaseUrl: z
          .string()
          .trim()
          .refine((value) => !value || URL.canParse(value), t('llm_config.validation_url')),
        chatModel: z
          .string()
          .trim()
          .min(1, t('llm_config.validation_model_required'))
          .max(160, t('llm_config.validation_model_max')),
        chatContextWindow: z.coerce
          .number()
          .int(t('llm_config.validation_integer'))
          .min(1024, t('llm_config.validation_context_min'))
          .max(2_000_000, t('llm_config.validation_context_max')),
        chatMaxTokens: z.coerce
          .number()
          .int(t('llm_config.validation_integer'))
          .min(1, t('llm_config.validation_output_min'))
          .max(1_000_000, t('llm_config.validation_output_max')),
        asrApiKey: z.string().max(500, t('llm_config.validation_api_key_max')),
        asrBaseUrl: z
          .string()
          .trim()
          .refine((value) => !value || URL.canParse(value), t('llm_config.validation_url')),
        asrModel: z
          .string()
          .trim()
          .min(1, t('llm_config.validation_model_required'))
          .max(160, t('llm_config.validation_model_max')),
        embeddingApiKey: z.string().max(500, t('llm_config.validation_api_key_max')),
        embeddingBaseUrl: z
          .string()
          .trim()
          .refine((value) => !value || URL.canParse(value), t('llm_config.validation_url')),
        embeddingModel: z.string().trim().max(160, t('llm_config.validation_model_max')),
        embeddingDimensions: z.coerce
          .number()
          .int(t('llm_config.validation_integer'))
          .min(1, t('llm_config.validation_embedding_dimensions'))
          .max(8192, t('llm_config.validation_embedding_dimensions')),
        requestTimeoutMs: z.coerce
          .number()
          .int(t('llm_config.validation_integer'))
          .min(5000, t('llm_config.validation_timeout'))
          .max(300000, t('llm_config.validation_timeout')),
      })
      .superRefine((values, context) => {
        if (values.chatMaxTokens >= values.chatContextWindow) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['chatMaxTokens'],
            message: t('llm_config.validation_max_output_below_context'),
          })
        }
      })
  )
)
const form = useForm({
  validationSchema: formSchema,
  initialValues,
})

const hasUnsavedChanges = computed(() =>
  hasUnsavedLlmConfiguration(form.values, savedConfiguration.value)
)
const canTestSavedConfiguration = computed(
  () => savedConfiguration.value !== null && !hasUnsavedChanges.value
)

function applySavedConfiguration(config: LlmConfiguration) {
  form.resetForm({
    values: {
      chatApiKey: '',
      chatBaseUrl: config.chat.baseUrl ?? '',
      chatModel: config.chat.model,
      chatContextWindow: config.chat.contextWindow,
      chatMaxTokens: config.chat.maxTokens,
      asrApiKey: '',
      asrBaseUrl: config.asr.baseUrl ?? '',
      asrModel: config.asr.model,
      embeddingApiKey: '',
      embeddingBaseUrl: config.embedding.baseUrl ?? '',
      embeddingModel: config.embedding.model ?? '',
      embeddingDimensions: config.embedding.dimensions,
      requestTimeoutMs: config.requestTimeoutMs,
    },
  })
  savedConfiguration.value = config
}

async function load() {
  try {
    const config = await getLlmConfiguration(auth.token)
    applySavedConfiguration(config)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('llm_config.load_failed'))
  } finally {
    loading.value = false
  }
}

async function submit(values: typeof form.values) {
  saving.value = true
  try {
    const completeValues = { ...initialValues, ...values }
    const config = await updateLlmConfiguration(auth.token, {
      ...completeValues,
      chatApiKey: completeValues.chatApiKey || undefined,
      asrApiKey: completeValues.asrApiKey || undefined,
      embeddingApiKey: completeValues.embeddingApiKey || undefined,
    })
    applySavedConfiguration(config)
    toast.success(t('llm_config.saved'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('llm_config.save_failed'))
  } finally {
    saving.value = false
  }
}

const save = form.handleSubmit(submit, ({ errors }) =>
  toast.error(firstFormError(errors, t('common.form_check_errors')))
)

async function testConnection() {
  if (!savedConfiguration.value) {
    toast.error(t('llm_config.test_config_unavailable'))
    return
  }
  if (hasUnsavedChanges.value) {
    toast.info(t('llm_config.save_before_test'))
    return
  }

  testing.value = true
  try {
    const result = await testLlmConfiguration(auth.token)
    if (!result.ok) {
      const labels = result.failedServices
        .map((service) => t(`llm_config.${service}_title`))
        .join('、')
      toast.error(t('llm_config.test_failed_services', { services: labels }))
    } else {
      toast.success(t('llm_config.test_success'))
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('llm_config.test_failed'))
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>

<template>
  <SettingsPageTemplate :title="t('llm_config.title')" :description="t('llm_config.description')">
    <div v-if="loading" class="text-sm text-muted-foreground">{{ t('common.loading') }}</div>
    <form v-else class="space-y-4" @submit.prevent="save">
      <Card>
        <CardHeader
          ><CardTitle class="flex items-center gap-2"
            ><BrainCircuit class="size-5" />{{ t('llm_config.chat_title') }}</CardTitle
          ><CardDescription>{{ t('llm_config.chat_description') }}</CardDescription></CardHeader
        >
        <CardContent class="grid items-start gap-4 md:grid-cols-2">
          <FormField
            v-slot="{ componentField }"
            name="chatBaseUrl"
            :validate-on-blur="false"
            class="md:col-span-2"
          >
            <FormItem>
              <FormLabel>{{ t('llm_config.base_url') }}</FormLabel>
              <FormControl>
                <Input v-bind="componentField" placeholder="https://api.example.com/v1" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="chatModel" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('llm_config.model') }}</FormLabel>
              <FormControl><Input v-bind="componentField" /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="chatApiKey" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('llm_config.api_key') }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  type="password"
                  :placeholder="t('llm_config.keep_existing')"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="chatContextWindow" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('llm_config.context_window') }}</FormLabel>
              <FormControl><Input v-bind="componentField" type="number" /></FormControl>
              <p class="text-xs text-muted-foreground">{{ t('llm_config.context_window_hint') }}</p>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="chatMaxTokens" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('llm_config.max_output_tokens') }}</FormLabel>
              <FormControl><Input v-bind="componentField" type="number" /></FormControl>
              <p class="text-xs text-muted-foreground">
                {{ t('llm_config.max_output_tokens_hint') }}
              </p>
              <FormMessage />
            </FormItem>
          </FormField>
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          ><CardTitle class="flex items-center gap-2"
            ><AudioLines class="size-5" />{{ t('llm_config.asr_title') }}</CardTitle
          ><CardDescription>{{ t('llm_config.asr_description') }}</CardDescription></CardHeader
        >
        <CardContent class="grid items-start gap-4 md:grid-cols-2">
          <FormField
            v-slot="{ componentField }"
            name="asrBaseUrl"
            :validate-on-blur="false"
            class="md:col-span-2"
          >
            <FormItem>
              <FormLabel>{{ t('llm_config.base_url') }}</FormLabel>
              <FormControl>
                <Input v-bind="componentField" placeholder="http://localhost:8000/v1" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="asrModel" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('llm_config.model') }}</FormLabel>
              <FormControl><Input v-bind="componentField" /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="asrApiKey" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('llm_config.api_key') }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  type="password"
                  :placeholder="t('llm_config.keep_existing')"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          ><CardTitle class="flex items-center gap-2"
            ><Network class="size-5" />{{ t('llm_config.embedding_title') }}</CardTitle
          ><CardDescription>{{
            t('llm_config.embedding_description')
          }}</CardDescription></CardHeader
        >
        <CardContent class="grid items-start gap-4 md:grid-cols-2">
          <FormField
            v-slot="{ componentField }"
            name="embeddingBaseUrl"
            :validate-on-blur="false"
            class="md:col-span-2"
          >
            <FormItem>
              <FormLabel>{{ t('llm_config.base_url') }}</FormLabel>
              <FormControl><Input v-bind="componentField" /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="embeddingModel" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('llm_config.model') }}</FormLabel>
              <FormControl><Input v-bind="componentField" /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="embeddingApiKey" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('llm_config.api_key') }}</FormLabel>
              <FormControl>
                <Input
                  v-bind="componentField"
                  type="password"
                  :placeholder="t('llm_config.keep_existing')"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField
            v-slot="{ componentField }"
            name="embeddingDimensions"
            :validate-on-blur="false"
          >
            <FormItem>
              <FormLabel>{{ t('llm_config.dimensions') }}</FormLabel>
              <FormControl><Input v-bind="componentField" type="number" /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </CardContent>
      </Card>
      <Card
        ><CardContent class="grid items-end gap-4 pt-6 md:grid-cols-2"
          ><FormField v-slot="{ componentField }" name="requestTimeoutMs" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('llm_config.timeout') }}</FormLabel>
              <FormControl><Input v-bind="componentField" type="number" /></FormControl>
              <FormMessage />
            </FormItem> </FormField></CardContent
      ></Card>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <p
          v-if="!canTestSavedConfiguration"
          class="mr-auto text-sm text-muted-foreground"
          role="status"
        >
          {{
            savedConfiguration
              ? t('llm_config.save_before_test')
              : t('llm_config.test_config_unavailable')
          }}
        </p>
        <Button
          type="button"
          variant="outline"
          :disabled="testing || saving || !can('llm-config:test') || !canTestSavedConfiguration"
          @click="testConnection"
          ><LoaderCircle v-if="testing" class="size-4 animate-spin" /><TestTube
            v-else
            class="size-4"
          />{{ t('llm_config.test') }}</Button
        ><Button type="submit" :disabled="saving || testing || !can('llm-config:update')"
          ><LoaderCircle v-if="saving" class="size-4 animate-spin" /><Save
            v-else
            class="size-4"
          />{{ t('common.save') }}</Button
        >
      </div>
    </form>
  </SettingsPageTemplate>
</template>

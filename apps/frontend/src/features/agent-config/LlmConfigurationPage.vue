<script setup lang="ts">
import {
  BrainCircuit,
  LoaderCircle,
  MessageSquare,
  Save,
  Server,
  TestTube,
  Wrench,
} from '@lucide/vue'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { nextTick } from 'vue'
import { toast } from 'vue-sonner'
import { z } from 'zod'

import SettingsSectionNavigation from '@/components/common/SettingsSectionNavigation.vue'
import SettingsPageTemplate from '@/components/templates/SettingsPageTemplate.vue'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import ImConfigurationSection from '@/features/im-config/ImConfigurationSection.vue'
import { firstFormError } from '@/lib/form-validation'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

import AgentMcpCard from './AgentMcpCard.vue'
import AgentToolsCard from './AgentToolsCard.vue'
import {
  getLlmConfiguration,
  type LlmConfiguration,
  type LlmServiceName,
  testLlmConfiguration,
  updateLlmConfiguration,
} from './api'
import { buildLlmConfigurationUpdate, hasUnsavedLlmConfiguration } from './form-state'

const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const { can } = usePermission()
const activeModule = ref('models')
watch(
  () => route.query.module,
  (module) => {
    activeModule.value = module === 'im' ? 'im' : 'models'
  },
  { immediate: true }
)
const sections = computed(() => [
  { value: 'models', label: t('agent_config.module_models'), icon: BrainCircuit },
  { value: 'tools', label: t('agent_config.module_tools'), icon: Wrench },
  { value: 'mcp', label: t('agent_config.module_mcp'), icon: Server },
  { value: 'im', label: t('agent_config.module_im'), icon: MessageSquare },
])
const loading = ref(true)
const saving = ref(false)
const savingService = ref<'chat' | 'asr' | 'embedding' | null>(null)
const testingService = ref<LlmServiceName | null>(null)
const testing = computed(() => testingService.value !== null)
const validationService = ref<'chat' | 'asr' | 'embedding'>('chat')
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
}
const optionalUrl = () =>
  z
    .string()
    .trim()
    .refine((value) => !value || URL.canParse(value), t('llm_config.validation_url'))
const requiredModel = () =>
  z
    .string()
    .trim()
    .min(1, t('llm_config.validation_model_required'))
    .max(160, t('llm_config.validation_model_max'))
const chatSchema = z
  .object({
    chatApiKey: z.string().max(500, t('llm_config.validation_api_key_max')),
    chatBaseUrl: optionalUrl(),
    chatModel: requiredModel(),
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
const asrSchema = z.object({
  asrApiKey: z.string().max(500, t('llm_config.validation_api_key_max')),
  asrBaseUrl: optionalUrl(),
  asrModel: requiredModel(),
})
const embeddingSchema = z.object({
  embeddingApiKey: z.string().max(500, t('llm_config.validation_api_key_max')),
  embeddingBaseUrl: optionalUrl(),
  embeddingModel: z.string().trim().max(160, t('llm_config.validation_model_max')),
})
const formSchema = computed(() =>
  toTypedSchema(
    validationService.value === 'chat'
      ? chatSchema
      : validationService.value === 'asr'
        ? asrSchema
        : embeddingSchema
  )
)
const form = useForm({
  validationSchema: formSchema,
  initialValues,
})

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

async function submit() {
  if (!savedConfiguration.value) {
    toast.error(t('llm_config.load_failed'))
    return
  }

  const service = validationService.value
  saving.value = true
  savingService.value = service
  try {
    const config = await updateLlmConfiguration(
      auth.token,
      buildLlmConfigurationUpdate(form.values, savedConfiguration.value, service)
    )
    savedConfiguration.value = config
    if (service === 'chat') form.setFieldValue('chatApiKey', '')
    if (service === 'asr') form.setFieldValue('asrApiKey', '')
    if (service === 'embedding') form.setFieldValue('embeddingApiKey', '')
    toast.success(t('llm_config.service_saved', { service: t(`llm_config.${service}_title`) }))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('llm_config.save_failed'))
  } finally {
    saving.value = false
    savingService.value = null
  }
}

const submitForm = form.handleSubmit(submit, ({ errors }) =>
  toast.error(firstFormError(errors, t('common.form_check_errors')))
)

async function saveService(service: 'chat' | 'asr' | 'embedding') {
  if (saving.value || testing.value) return
  validationService.value = service
  await nextTick()
  await submitForm()
}

async function testConnection(service: LlmServiceName) {
  if (!savedConfiguration.value) {
    toast.error(t('llm_config.test_config_unavailable'))
    return
  }
  if (hasUnsavedLlmConfiguration(form.values, savedConfiguration.value, service)) {
    toast.info(t('llm_config.save_before_test'))
    return
  }

  testingService.value = service
  try {
    const result = await testLlmConfiguration(auth.token, service)
    if (!result.ok) {
      const labels = result.failedServices
        .map((service) => t(`llm_config.${service}_title`))
        .join('、')
      toast.error(t('llm_config.test_failed_services', { services: labels }))
    } else {
      toast.success(
        t('llm_config.service_test_success', { service: t(`llm_config.${service}_title`) })
      )
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('llm_config.test_failed'))
  } finally {
    testingService.value = null
  }
}

onMounted(load)
</script>

<template>
  <SettingsPageTemplate
    :title="t('agent_config.title')"
    :description="t('agent_config.description')"
  >
    <template #navigation>
      <SettingsSectionNavigation
        v-if="!loading"
        v-model="activeModule"
        :items="sections"
        :label="t('agent_config.sections_label')"
      />
    </template>
    <div v-if="loading" class="text-sm text-muted-foreground">{{ t('common.loading') }}</div>
    <div v-else v-show="activeModule === 'models'" class="space-y-4">
      <div class="space-y-4">
        <form class="space-y-4" @submit.prevent="saveService('chat')">
          <Card>
            <CardHeader>
              <CardTitle>{{ t('llm_config.chat_title') }}</CardTitle>
              <CardDescription>{{ t('llm_config.chat_description') }}</CardDescription>
            </CardHeader>
            <CardContent class="grid items-start gap-4 md:grid-cols-2">
              <FormField
                v-slot="{ componentField }"
                name="chatBaseUrl"
                :validate-on-blur="false"
                class="md:col-span-2"
              >
                <FormItem>
                  <FormLabel>{{ t('llm_config.base_url') }}</FormLabel>
                  <FormControl
                    ><Input
                      v-bind="componentField"
                      :disabled="saving || testing || !can('agent-config:update')"
                      :placeholder="t('llm_config.chat_base_url_placeholder')"
                  /></FormControl>
                  <FormMessage />
                </FormItem>
              </FormField>
              <FormField v-slot="{ componentField }" name="chatModel" :validate-on-blur="false">
                <FormItem>
                  <FormLabel>{{ t('llm_config.model') }}</FormLabel>
                  <FormControl
                    ><Input
                      v-bind="componentField"
                      :disabled="saving || testing || !can('agent-config:update')"
                      :placeholder="t('llm_config.chat_model_placeholder')"
                  /></FormControl>
                  <FormMessage />
                </FormItem>
              </FormField>
              <FormField v-slot="{ componentField }" name="chatApiKey" :validate-on-blur="false">
                <FormItem>
                  <FormLabel>{{ t('llm_config.api_key') }}</FormLabel>
                  <FormControl
                    ><Input
                      v-bind="componentField"
                      type="password"
                      :disabled="saving || testing || !can('agent-config:update')"
                      :placeholder="t('llm_config.keep_existing')"
                  /></FormControl>
                  <FormMessage />
                </FormItem>
              </FormField>
              <FormField
                v-slot="{ componentField }"
                name="chatContextWindow"
                :validate-on-blur="false"
              >
                <FormItem>
                  <FormLabel>{{ t('llm_config.context_window') }}</FormLabel>
                  <FormControl
                    ><Input
                      v-bind="componentField"
                      type="number"
                      :disabled="saving || testing || !can('agent-config:update')"
                      :placeholder="t('llm_config.context_window_placeholder')"
                  /></FormControl>
                  <p class="text-xs text-muted-foreground">
                    {{ t('llm_config.context_window_hint') }}
                  </p>
                  <FormMessage />
                </FormItem>
              </FormField>
              <FormField v-slot="{ componentField }" name="chatMaxTokens" :validate-on-blur="false">
                <FormItem>
                  <FormLabel>{{ t('llm_config.max_output_tokens') }}</FormLabel>
                  <FormControl
                    ><Input
                      v-bind="componentField"
                      type="number"
                      :disabled="saving || testing || !can('agent-config:update')"
                      :placeholder="t('llm_config.max_output_tokens_placeholder')"
                  /></FormControl>
                  <p class="text-xs text-muted-foreground">
                    {{ t('llm_config.max_output_tokens_hint') }}
                  </p>
                  <FormMessage />
                </FormItem>
              </FormField>
            </CardContent>
            <CardFooter class="justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                :disabled="saving || testing || !can('agent-config:update') || !savedConfiguration"
                @click="testConnection('chat')"
              >
                <LoaderCircle v-if="testingService === 'chat'" class="size-4 animate-spin" />
                <TestTube v-else class="size-4" />{{ t('llm_config.test') }}
              </Button>
              <Button
                type="submit"
                :disabled="saving || testing || !can('agent-config:update') || !savedConfiguration"
              >
                <LoaderCircle v-if="savingService === 'chat'" class="size-4 animate-spin" />
                <Save v-else class="size-4" />{{ t('common.save') }}
              </Button>
            </CardFooter>
          </Card>
        </form>

        <form class="space-y-4" @submit.prevent="saveService('asr')">
          <Card>
            <CardHeader>
              <CardTitle>{{ t('llm_config.asr_title') }}</CardTitle>
              <CardDescription>{{ t('llm_config.asr_description') }}</CardDescription>
            </CardHeader>
            <CardContent class="grid items-start gap-4 md:grid-cols-2">
              <FormField
                v-slot="{ componentField }"
                name="asrBaseUrl"
                :validate-on-blur="false"
                class="md:col-span-2"
              >
                <FormItem>
                  <FormLabel>{{ t('llm_config.base_url') }}</FormLabel>
                  <FormControl
                    ><Input
                      v-bind="componentField"
                      :disabled="saving || testing || !can('agent-config:update')"
                      :placeholder="t('llm_config.asr_base_url_placeholder')"
                  /></FormControl>
                  <FormMessage />
                </FormItem>
              </FormField>
              <FormField v-slot="{ componentField }" name="asrModel" :validate-on-blur="false">
                <FormItem>
                  <FormLabel>{{ t('llm_config.model') }}</FormLabel>
                  <FormControl
                    ><Input
                      v-bind="componentField"
                      :disabled="saving || testing || !can('agent-config:update')"
                      :placeholder="t('llm_config.asr_model_placeholder')"
                  /></FormControl>
                  <FormMessage />
                </FormItem>
              </FormField>
              <FormField v-slot="{ componentField }" name="asrApiKey" :validate-on-blur="false">
                <FormItem>
                  <FormLabel>{{ t('llm_config.api_key') }}</FormLabel>
                  <FormControl
                    ><Input
                      v-bind="componentField"
                      type="password"
                      :disabled="saving || testing || !can('agent-config:update')"
                      :placeholder="t('llm_config.keep_existing')"
                  /></FormControl>
                  <FormMessage />
                </FormItem>
              </FormField>
            </CardContent>
            <CardFooter class="justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                :disabled="saving || testing || !can('agent-config:update') || !savedConfiguration"
                @click="testConnection('asr')"
              >
                <LoaderCircle v-if="testingService === 'asr'" class="size-4 animate-spin" />
                <TestTube v-else class="size-4" />{{ t('llm_config.test') }}
              </Button>
              <Button
                type="submit"
                :disabled="saving || testing || !can('agent-config:update') || !savedConfiguration"
              >
                <LoaderCircle v-if="savingService === 'asr'" class="size-4 animate-spin" />
                <Save v-else class="size-4" />{{ t('common.save') }}
              </Button>
            </CardFooter>
          </Card>
        </form>

        <form class="space-y-4" @submit.prevent="saveService('embedding')">
          <Card>
            <CardHeader>
              <CardTitle>{{ t('llm_config.embedding_title') }}</CardTitle>
              <CardDescription>{{ t('llm_config.embedding_description') }}</CardDescription>
            </CardHeader>
            <CardContent class="grid items-start gap-4 md:grid-cols-2">
              <FormField
                v-slot="{ componentField }"
                name="embeddingBaseUrl"
                :validate-on-blur="false"
                class="md:col-span-2"
              >
                <FormItem>
                  <FormLabel>{{ t('llm_config.base_url') }}</FormLabel>
                  <FormControl
                    ><Input
                      v-bind="componentField"
                      :disabled="saving || testing || !can('agent-config:update')"
                      :placeholder="t('llm_config.embedding_base_url_placeholder')"
                  /></FormControl>
                  <FormMessage />
                </FormItem>
              </FormField>
              <FormField
                v-slot="{ componentField }"
                name="embeddingModel"
                :validate-on-blur="false"
              >
                <FormItem>
                  <FormLabel>{{ t('llm_config.model') }}</FormLabel>
                  <FormControl
                    ><Input
                      v-bind="componentField"
                      :disabled="saving || testing || !can('agent-config:update')"
                      :placeholder="t('llm_config.embedding_model_placeholder')"
                  /></FormControl>
                  <FormMessage />
                </FormItem>
              </FormField>
              <FormField
                v-slot="{ componentField }"
                name="embeddingApiKey"
                :validate-on-blur="false"
              >
                <FormItem>
                  <FormLabel>{{ t('llm_config.api_key') }}</FormLabel>
                  <FormControl
                    ><Input
                      v-bind="componentField"
                      type="password"
                      :disabled="saving || testing || !can('agent-config:update')"
                      :placeholder="t('llm_config.keep_existing')"
                  /></FormControl>
                  <FormMessage />
                </FormItem>
              </FormField>
              <div class="rounded-md border bg-muted/30 px-3 py-2 md:col-span-2">
                <div class="text-sm font-medium">{{ t('llm_config.dimensions') }}</div>
                <div class="mt-1 text-sm text-muted-foreground">1024</div>
              </div>
            </CardContent>
            <CardFooter class="justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                :disabled="saving || testing || !can('agent-config:update') || !savedConfiguration"
                @click="testConnection('embedding')"
              >
                <LoaderCircle v-if="testingService === 'embedding'" class="size-4 animate-spin" />
                <TestTube v-else class="size-4" />{{ t('llm_config.test') }}
              </Button>
              <Button
                type="submit"
                :disabled="saving || testing || !can('agent-config:update') || !savedConfiguration"
              >
                <LoaderCircle v-if="savingService === 'embedding'" class="size-4 animate-spin" />
                <Save v-else class="size-4" />{{ t('common.save') }}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
    <div v-if="!loading" v-show="activeModule === 'tools'" class="flex min-h-0 flex-1 flex-col">
      <AgentToolsCard />
    </div>
    <div v-if="!loading" v-show="activeModule === 'mcp'" class="flex min-h-0 flex-1 flex-col">
      <AgentMcpCard />
    </div>
    <div v-if="!loading" v-show="activeModule === 'im'">
      <ImConfigurationSection />
    </div>
  </SettingsPageTemplate>
</template>

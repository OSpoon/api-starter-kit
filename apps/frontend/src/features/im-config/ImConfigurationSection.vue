<script setup lang="ts">
import { LoaderCircle, Save } from '@lucide/vue'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { nextTick } from 'vue'
import { toast } from 'vue-sonner'
import { z } from 'zod'

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
import { firstFormError } from '@/lib/form-validation'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

import { getImConfiguration, updateImConfiguration } from './api'

const { t } = useI18n()
const auth = useAuthStore()
const { can } = usePermission()
const loading = ref(true)
type ImChannel = 'wecom' | 'feishu' | 'dingtalk'
const validationChannel = ref<ImChannel | null>(null)
const savingChannel = ref<ImChannel | null>(null)
const saving = computed(() => savingChannel.value !== null)
const initialValues = {
  wecomBotId: '',
  wecomBotSecret: '',
  wecomBotTenantId: '',
  wecomBotWsUrl: '',
  feishuAppId: '',
  feishuAppSecret: '',
  feishuDomain: '',
  dingtalkClientId: '',
  dingtalkClientSecret: '',
  dingtalkCardTemplateId: '',
  dingtalkStreamingCardTemplateId: '',
}
type ImConfigurationDraft = typeof initialValues
const field = (max: number) => z.string().trim().max(max, t('im_config.validation_max', { max }))
const channelSchemas = {
  wecom: z.object({
    wecomBotId: field(160),
    wecomBotSecret: field(500),
    wecomBotTenantId: field(160),
    wecomBotWsUrl: field(500).refine(
      (value) => !value || URL.canParse(value),
      t('llm_config.validation_url')
    ),
  }),
  feishu: z.object({
    feishuAppId: field(160),
    feishuAppSecret: field(500),
    feishuDomain: field(80),
  }),
  dingtalk: z.object({
    dingtalkClientId: field(160),
    dingtalkClientSecret: field(500),
    dingtalkCardTemplateId: field(200),
    dingtalkStreamingCardTemplateId: field(200),
  }),
}
const validationSchema = computed(() =>
  toTypedSchema(channelSchemas[validationChannel.value ?? 'wecom'])
)
const form = useForm<ImConfigurationDraft>({ validationSchema, initialValues })

async function load() {
  try {
    const config = await getImConfiguration(auth.token)
    form.resetForm({
      values: {
        ...initialValues,
        wecomBotId: config.wecomBot.botId ?? '',
        wecomBotTenantId: config.wecomBot.tenantId ?? '',
        wecomBotWsUrl: config.wecomBot.wsUrl ?? '',
        feishuAppId: config.feishuBot.appId ?? '',
        feishuDomain: config.feishuBot.domain ?? '',
        dingtalkClientId: config.dingtalkBot.clientId ?? '',
        dingtalkCardTemplateId: config.dingtalkBot.cardTemplateId ?? '',
        dingtalkStreamingCardTemplateId: config.dingtalkBot.streamingCardTemplateId ?? '',
      },
    })
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('im_config.load_failed'))
  } finally {
    loading.value = false
  }
}

const submitForm = form.handleSubmit(
  async (values) => {
    const channel = validationChannel.value
    if (!channel) return
    savingChannel.value = channel
    try {
      const payload =
        channel === 'wecom'
          ? {
              wecomBotId: values.wecomBotId,
              wecomBotSecret: values.wecomBotSecret || undefined,
              wecomBotTenantId: values.wecomBotTenantId,
              wecomBotWsUrl: values.wecomBotWsUrl,
            }
          : channel === 'feishu'
            ? {
                feishuAppId: values.feishuAppId,
                feishuAppSecret: values.feishuAppSecret || undefined,
                feishuDomain: values.feishuDomain,
              }
            : {
                dingtalkClientId: values.dingtalkClientId,
                dingtalkClientSecret: values.dingtalkClientSecret || undefined,
                dingtalkCardTemplateId: values.dingtalkCardTemplateId,
                dingtalkStreamingCardTemplateId: values.dingtalkStreamingCardTemplateId,
              }
      await updateImConfiguration(auth.token, payload)
      if (channel === 'wecom') form.setFieldValue('wecomBotSecret', '')
      if (channel === 'feishu') form.setFieldValue('feishuAppSecret', '')
      if (channel === 'dingtalk') form.setFieldValue('dingtalkClientSecret', '')
      toast.success(t('im_config.channel_saved', { channel: t(`llm_config.${channel}_title`) }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('im_config.save_failed'))
    } finally {
      savingChannel.value = null
    }
  },
  ({ errors }) => toast.error(firstFormError(errors, t('common.form_check_errors')))
)

async function saveChannel(channel: ImChannel) {
  if (savingChannel.value || validationChannel.value) return
  validationChannel.value = channel
  await nextTick()
  try {
    await submitForm()
  } finally {
    validationChannel.value = null
  }
}

onMounted(load)
</script>

<template>
  <p v-if="loading" class="py-8 text-center text-sm text-muted-foreground">
    {{ t('common.loading') }}
  </p>
  <div v-else class="space-y-4">
    <form class="min-w-0" @submit.prevent="saveChannel('wecom')">
      <Card class="min-w-0">
        <CardHeader>
          <CardTitle>{{ t('llm_config.wecom_title') }}</CardTitle>
          <CardDescription>{{ t('llm_config.wecom_description') }}</CardDescription>
        </CardHeader>
        <CardContent class="grid items-start gap-4 md:grid-cols-2">
          <FormField v-slot="{ componentField }" name="wecomBotId" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('llm_config.wecom_bot_id') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  :disabled="!can('agent-config:update') || saving"
                  :placeholder="t('llm_config.wecom_bot_id_placeholder')"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="wecomBotTenantId" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('llm_config.wecom_tenant_id') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  :disabled="!can('agent-config:update') || saving"
                  :placeholder="t('llm_config.wecom_tenant_id_placeholder')"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField
            v-slot="{ componentField }"
            name="wecomBotSecret"
            :validate-on-blur="false"
            class="md:col-span-2"
          >
            <FormItem>
              <FormLabel>{{ t('llm_config.wecom_secret') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  type="password"
                  :disabled="!can('agent-config:update') || saving"
                  :placeholder="t('im_config.secret_placeholder')"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField
            v-slot="{ componentField }"
            name="wecomBotWsUrl"
            :validate-on-blur="false"
            class="md:col-span-2"
          >
            <FormItem>
              <FormLabel>{{ t('llm_config.wecom_ws_url') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  :disabled="!can('agent-config:update') || saving"
                  :placeholder="t('llm_config.wecom_ws_url_placeholder')"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </CardContent>
        <CardFooter class="justify-end">
          <Button type="submit" :disabled="saving || !can('agent-config:update')">
            <LoaderCircle v-if="savingChannel === 'wecom'" class="size-4 animate-spin" />
            <Save v-else class="size-4" />{{ t('common.save') }}
          </Button>
        </CardFooter>
      </Card>
    </form>
    <form class="min-w-0" @submit.prevent="saveChannel('feishu')">
      <Card class="min-w-0">
        <CardHeader>
          <CardTitle>{{ t('llm_config.feishu_title') }}</CardTitle>
          <CardDescription>{{ t('llm_config.feishu_description') }}</CardDescription>
        </CardHeader>
        <CardContent class="grid items-start gap-4 md:grid-cols-2">
          <FormField v-slot="{ componentField }" name="feishuAppId" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('llm_config.feishu_app_id') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  :disabled="!can('agent-config:update') || saving"
                  :placeholder="t('llm_config.feishu_app_id_placeholder')"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="feishuDomain" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('llm_config.feishu_domain') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  :disabled="!can('agent-config:update') || saving"
                  :placeholder="t('llm_config.feishu_domain_placeholder')"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField
            v-slot="{ componentField }"
            name="feishuAppSecret"
            :validate-on-blur="false"
            class="md:col-span-2"
          >
            <FormItem>
              <FormLabel>{{ t('llm_config.feishu_app_secret') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  type="password"
                  :disabled="!can('agent-config:update') || saving"
                  :placeholder="t('im_config.secret_placeholder')"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </CardContent>
        <CardFooter class="justify-end">
          <Button type="submit" :disabled="saving || !can('agent-config:update')">
            <LoaderCircle v-if="savingChannel === 'feishu'" class="size-4 animate-spin" />
            <Save v-else class="size-4" />{{ t('common.save') }}
          </Button>
        </CardFooter>
      </Card>
    </form>
    <form class="min-w-0" @submit.prevent="saveChannel('dingtalk')">
      <Card class="min-w-0">
        <CardHeader>
          <CardTitle>{{ t('llm_config.dingtalk_title') }}</CardTitle>
          <CardDescription>{{ t('llm_config.dingtalk_description') }}</CardDescription>
        </CardHeader>
        <CardContent class="grid items-start gap-4 md:grid-cols-2">
          <FormField v-slot="{ componentField }" name="dingtalkClientId" :validate-on-blur="false">
            <FormItem>
              <FormLabel>{{ t('llm_config.dingtalk_client_id') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  :disabled="!can('agent-config:update') || saving"
                  :placeholder="t('llm_config.dingtalk_client_id_placeholder')"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField
            v-slot="{ componentField }"
            name="dingtalkClientSecret"
            :validate-on-blur="false"
          >
            <FormItem>
              <FormLabel>{{ t('llm_config.dingtalk_client_secret') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  type="password"
                  :disabled="!can('agent-config:update') || saving"
                  :placeholder="t('im_config.secret_placeholder')"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField
            v-slot="{ componentField }"
            name="dingtalkCardTemplateId"
            :validate-on-blur="false"
          >
            <FormItem>
              <FormLabel>{{ t('llm_config.dingtalk_card_template_id') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  :disabled="!can('agent-config:update') || saving"
                  :placeholder="t('llm_config.dingtalk_card_template_id_placeholder')"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField
            v-slot="{ componentField }"
            name="dingtalkStreamingCardTemplateId"
            :validate-on-blur="false"
          >
            <FormItem>
              <FormLabel>{{ t('llm_config.dingtalk_streaming_card_template_id') }}</FormLabel>
              <FormControl
                ><Input
                  v-bind="componentField"
                  :disabled="!can('agent-config:update') || saving"
                  :placeholder="t('llm_config.dingtalk_streaming_card_template_id_placeholder')"
              /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </CardContent>
        <CardFooter class="justify-end">
          <Button type="submit" :disabled="saving || !can('agent-config:update')">
            <LoaderCircle v-if="savingChannel === 'dingtalk'" class="size-4 animate-spin" />
            <Save v-else class="size-4" />{{ t('common.save') }}
          </Button>
        </CardFooter>
      </Card>
    </form>
  </div>
</template>

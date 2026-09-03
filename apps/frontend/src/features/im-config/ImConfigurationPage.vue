<script setup lang="ts">
import { Info, LoaderCircle, Save } from '@lucide/vue'
import { toast } from 'vue-sonner'

import SettingsPageTemplate from '@/components/templates/SettingsPageTemplate.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

import DingtalkIcon from '../llm-config/components/DingtalkIcon.vue'
import FeishuIcon from '../llm-config/components/FeishuIcon.vue'
import WecomIcon from '../llm-config/components/WecomIcon.vue'
import { getImConfiguration, updateImConfiguration } from './api'

const { t } = useI18n()
const auth = useAuthStore()
const { can } = usePermission()
const loading = ref(true)
const saving = ref(false)
const form = reactive({
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
})

async function load() {
  try {
    const config = await getImConfiguration(auth.token)
    form.wecomBotId = config.wecomBot.botId ?? ''
    form.wecomBotTenantId = config.wecomBot.tenantId ?? ''
    form.wecomBotWsUrl = config.wecomBot.wsUrl ?? ''
    form.feishuAppId = config.feishuBot.appId ?? ''
    form.feishuDomain = config.feishuBot.domain ?? ''
    form.dingtalkClientId = config.dingtalkBot.clientId ?? ''
    form.dingtalkCardTemplateId = config.dingtalkBot.cardTemplateId ?? ''
    form.dingtalkStreamingCardTemplateId = config.dingtalkBot.streamingCardTemplateId ?? ''
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('im_config.load_failed'))
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await updateImConfiguration(auth.token, {
      ...form,
      wecomBotSecret: form.wecomBotSecret || undefined,
      feishuAppSecret: form.feishuAppSecret || undefined,
      dingtalkClientSecret: form.dingtalkClientSecret || undefined,
    })
    form.wecomBotSecret = ''
    form.feishuAppSecret = ''
    form.dingtalkClientSecret = ''
    toast.success(t('im_config.saved'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('im_config.save_failed'))
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <SettingsPageTemplate :title="t('im_config.title')" :description="t('im_config.description')">
    <div v-if="loading" class="text-sm text-muted-foreground">{{ t('common.loading') }}</div>
    <form v-else class="space-y-4" @submit.prevent="save">
      <Alert>
        <Info class="size-4" />
        <AlertTitle>{{ t('im_config.restart_title') }}</AlertTitle>
        <AlertDescription class="space-y-2">
          <p>{{ t('im_config.restart_description') }}</p>
          <code class="block overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
            {{ t('im_config.restart_command') }}
          </code>
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader
          ><CardTitle class="flex items-center gap-2"
            ><WecomIcon />{{ t('llm_config.wecom_title') }}</CardTitle
          ><CardDescription>{{ t('llm_config.wecom_description') }}</CardDescription></CardHeader
        >
        <CardContent class="grid items-start gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <Label for="wecom-bot-id">{{ t('llm_config.wecom_bot_id') }}</Label
            ><Input id="wecom-bot-id" v-model="form.wecomBotId" />
          </div>
          <div class="space-y-2">
            <Label for="wecom-bot-tenant-id">{{ t('llm_config.wecom_tenant_id') }}</Label
            ><Input id="wecom-bot-tenant-id" v-model="form.wecomBotTenantId" />
          </div>
          <div class="space-y-2 md:col-span-2">
            <Label for="wecom-bot-secret">{{ t('llm_config.wecom_secret') }}</Label
            ><Input
              id="wecom-bot-secret"
              v-model="form.wecomBotSecret"
              type="password"
              :placeholder="t('llm_config.keep_existing')"
            />
          </div>
          <div class="space-y-2 md:col-span-2">
            <Label for="wecom-bot-ws-url">{{ t('llm_config.wecom_ws_url') }}</Label
            ><Input id="wecom-bot-ws-url" v-model="form.wecomBotWsUrl" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          ><CardTitle class="flex items-center gap-2"
            ><FeishuIcon />{{ t('llm_config.feishu_title') }}</CardTitle
          ><CardDescription>{{ t('llm_config.feishu_description') }}</CardDescription></CardHeader
        >
        <CardContent class="grid items-start gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <Label for="feishu-app-id">{{ t('llm_config.feishu_app_id') }}</Label
            ><Input id="feishu-app-id" v-model="form.feishuAppId" />
          </div>
          <div class="space-y-2">
            <Label for="feishu-domain">{{ t('llm_config.feishu_domain') }}</Label
            ><Input id="feishu-domain" v-model="form.feishuDomain" />
          </div>
          <div class="space-y-2 md:col-span-2">
            <Label for="feishu-app-secret">{{ t('llm_config.feishu_app_secret') }}</Label
            ><Input
              id="feishu-app-secret"
              v-model="form.feishuAppSecret"
              type="password"
              :placeholder="t('llm_config.keep_existing')"
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          ><CardTitle class="flex items-center gap-2"
            ><DingtalkIcon />{{ t('llm_config.dingtalk_title') }}</CardTitle
          ><CardDescription>{{ t('llm_config.dingtalk_description') }}</CardDescription></CardHeader
        >
        <CardContent class="grid items-start gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <Label for="dingtalk-client-id">{{ t('llm_config.dingtalk_client_id') }}</Label
            ><Input id="dingtalk-client-id" v-model="form.dingtalkClientId" />
          </div>
          <div class="space-y-2">
            <Label for="dingtalk-client-secret">{{ t('llm_config.dingtalk_client_secret') }}</Label
            ><Input
              id="dingtalk-client-secret"
              v-model="form.dingtalkClientSecret"
              type="password"
              :placeholder="t('llm_config.keep_existing')"
            />
          </div>
          <div class="space-y-2">
            <Label for="dingtalk-card-template-id">{{
              t('llm_config.dingtalk_card_template_id')
            }}</Label
            ><Input id="dingtalk-card-template-id" v-model="form.dingtalkCardTemplateId" />
          </div>
          <div class="space-y-2">
            <Label for="dingtalk-streaming-card-template-id">{{
              t('llm_config.dingtalk_streaming_card_template_id')
            }}</Label
            ><Input
              id="dingtalk-streaming-card-template-id"
              v-model="form.dingtalkStreamingCardTemplateId"
            />
          </div>
        </CardContent>
      </Card>
      <div class="flex justify-end">
        <Button type="submit" :disabled="saving || !can('im-config:update')"
          ><LoaderCircle v-if="saving" class="size-4 animate-spin" />
          <Save v-else class="size-4" />{{ t('common.save') }}</Button
        >
      </div>
    </form>
  </SettingsPageTemplate>
</template>

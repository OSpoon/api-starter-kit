<script setup lang="ts">
import { BrainCircuit, LoaderCircle, Save, TestTube } from '@lucide/vue'
import { toast } from 'vue-sonner'

import SettingsPageTemplate from '@/components/templates/SettingsPageTemplate.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth'

import { getLlmConfiguration, testLlmConfiguration, updateLlmConfiguration } from './api'

const { t } = useI18n()
const auth = useAuthStore()
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const form = reactive({
  chatApiKey: '',
  chatBaseUrl: '',
  chatModel: '',
  asrApiKey: '',
  asrBaseUrl: '',
  asrModel: 'Qwen3-ASR-0.6B-4bit',
  embeddingApiKey: '',
  embeddingBaseUrl: '',
  embeddingModel: '',
  embeddingDimensions: 1024,
  requestTimeoutMs: 180000,
})

async function load() {
  try {
    const config = await getLlmConfiguration(auth.token)
    form.chatBaseUrl = config.chat.baseUrl ?? ''
    form.chatModel = config.chat.model
    form.asrBaseUrl = config.asr.baseUrl ?? ''
    form.asrModel = config.asr.model
    form.embeddingBaseUrl = config.embedding.baseUrl ?? ''
    form.embeddingModel = config.embedding.model ?? ''
    form.embeddingDimensions = config.embedding.dimensions
    form.requestTimeoutMs = config.requestTimeoutMs
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('llm_config.load_failed'))
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await updateLlmConfiguration(auth.token, {
      ...form,
      chatApiKey: form.chatApiKey || undefined,
      asrApiKey: form.asrApiKey || undefined,
      embeddingApiKey: form.embeddingApiKey || undefined,
    })
    form.chatApiKey = ''
    form.asrApiKey = ''
    form.embeddingApiKey = ''
    toast.success(t('llm_config.saved'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('llm_config.save_failed'))
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  testing.value = true
  try {
    await testLlmConfiguration(auth.token)
    toast.success(t('llm_config.test_success'))
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
          <div class="space-y-2 md:col-span-2">
            <Label for="chat-base-url">{{ t('llm_config.base_url') }}</Label
            ><Input
              id="chat-base-url"
              v-model="form.chatBaseUrl"
              placeholder="https://api.example.com/v1"
            />
          </div>
          <div class="space-y-2">
            <Label for="chat-model">{{ t('llm_config.model') }}</Label
            ><Input id="chat-model" v-model="form.chatModel" />
          </div>
          <div class="space-y-2">
            <Label for="chat-api-key">{{ t('llm_config.api_key') }}</Label
            ><Input
              id="chat-api-key"
              v-model="form.chatApiKey"
              type="password"
              :placeholder="t('llm_config.keep_existing')"
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          ><CardTitle>{{ t('llm_config.asr_title') }}</CardTitle
          ><CardDescription>{{ t('llm_config.asr_description') }}</CardDescription></CardHeader
        >
        <CardContent class="grid items-start gap-4 md:grid-cols-2">
          <div class="space-y-2 md:col-span-2">
            <Label for="asr-base-url">{{ t('llm_config.base_url') }}</Label>
            <Input
              id="asr-base-url"
              v-model="form.asrBaseUrl"
              placeholder="http://localhost:8000/v1"
            />
          </div>
          <div class="space-y-2">
            <Label for="asr-model">{{ t('llm_config.model') }}</Label>
            <Input id="asr-model" v-model="form.asrModel" />
          </div>
          <div class="space-y-2">
            <Label for="asr-api-key">{{ t('llm_config.api_key') }}</Label>
            <Input
              id="asr-api-key"
              v-model="form.asrApiKey"
              type="password"
              :placeholder="t('llm_config.keep_existing')"
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          ><CardTitle>{{ t('llm_config.embedding_title') }}</CardTitle
          ><CardDescription>{{
            t('llm_config.embedding_description')
          }}</CardDescription></CardHeader
        >
        <CardContent class="grid items-start gap-4 md:grid-cols-2">
          <div class="space-y-2 md:col-span-2">
            <Label for="embedding-base-url">{{ t('llm_config.base_url') }}</Label
            ><Input id="embedding-base-url" v-model="form.embeddingBaseUrl" />
          </div>
          <div class="space-y-2">
            <Label for="embedding-model">{{ t('llm_config.model') }}</Label
            ><Input id="embedding-model" v-model="form.embeddingModel" />
          </div>
          <div class="space-y-2">
            <Label for="embedding-api-key">{{ t('llm_config.api_key') }}</Label
            ><Input
              id="embedding-api-key"
              v-model="form.embeddingApiKey"
              type="password"
              :placeholder="t('llm_config.keep_existing')"
            />
          </div>
          <div class="space-y-2">
            <Label for="embedding-dimensions">{{ t('llm_config.dimensions') }}</Label
            ><Input
              id="embedding-dimensions"
              v-model.number="form.embeddingDimensions"
              type="number"
            />
          </div>
        </CardContent>
      </Card>
      <Card
        ><CardContent class="grid items-end gap-4 pt-6 md:grid-cols-2"
          ><div class="space-y-2">
            <Label for="request-timeout">{{ t('llm_config.timeout') }}</Label
            ><Input
              id="request-timeout"
              v-model.number="form.requestTimeoutMs"
              type="number"
            /></div></CardContent
      ></Card>
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          :disabled="testing || saving"
          @click="testConnection"
          ><LoaderCircle v-if="testing" class="size-4 animate-spin" /><TestTube
            v-else
            class="size-4"
          />{{ t('llm_config.test') }}</Button
        ><Button type="submit" :disabled="saving || testing"
          ><LoaderCircle v-if="saving" class="size-4 animate-spin" /><Save
            v-else
            class="size-4"
          />{{ t('common.save') }}</Button
        >
      </div>
    </form>
  </SettingsPageTemplate>
</template>

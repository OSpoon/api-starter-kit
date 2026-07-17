<script setup lang="ts">
import { Check, ChevronLeft, ChevronRight } from '@lucide/vue'
import { toast } from 'vue-sonner'

import WizardPageTemplate from '@/components/templates/WizardPageTemplate.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from '@/components/ui/stepper'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

const { t } = useI18n()
const step = ref(1)
const name = ref('')
const endpoint = ref('')
const description = ref('')
const enabled = ref(true)
const labels = computed(() => [
  t('wizard_template.basic_info'),
  t('wizard_template.connection'),
  t('wizard_template.complete'),
])

function next() {
  if (step.value === 1 && !name.value.trim()) return toast.error(t('wizard_template.name_required'))
  if (step.value === 2 && !endpoint.value.trim())
    return toast.error(t('wizard_template.endpoint_required'))
  step.value++
}
function finish() {
  toast.success(t('wizard_template.created'))
  step.value = 3
}
</script>

<template>
  <WizardPageTemplate
    :title="t('wizard_template.title')"
    :description="t('wizard_template.description')"
  >
    <template #steps
      ><Stepper v-model="step" class="grid grid-cols-3 gap-2"
        ><StepperItem
          v-for="(label, index) in labels"
          :key="label"
          :step="index + 1"
          class="relative min-w-0"
          ><StepperTrigger class="w-full"
            ><StepperIndicator
              ><Check v-if="index + 1 < step" class="size-3" /><span v-else>{{
                index + 1
              }}</span></StepperIndicator
            ><StepperTitle class="text-xs">{{ label }}</StepperTitle></StepperTrigger
          ><StepperSeparator
            v-if="index < labels.length - 1"
            class="absolute top-4 right-[calc(-50%+1rem)] left-[calc(50%+1rem)] h-px" /></StepperItem></Stepper
    ></template>
    <div v-if="step === 1" class="space-y-4">
      <h2>{{ t('wizard_template.basic_info') }}</h2>
      <div class="grid gap-2">
        <Label for="integration-name">{{ t('wizard_template.name') }}</Label
        ><Input
          id="integration-name"
          v-model="name"
          :placeholder="t('wizard_template.name_placeholder')"
        />
      </div>
      <div class="grid gap-2">
        <Label for="integration-description">{{ t('wizard_template.description_label') }}</Label
        ><Textarea
          id="integration-description"
          v-model="description"
          :placeholder="t('wizard_template.description_placeholder')"
        />
      </div>
    </div>
    <div v-else-if="step === 2" class="space-y-4">
      <h2>{{ t('wizard_template.connection') }}</h2>
      <div class="grid gap-2">
        <Label for="integration-endpoint">{{ t('wizard_template.endpoint') }}</Label
        ><Input
          id="integration-endpoint"
          v-model="endpoint"
          placeholder="https://api.example.com"
        />
      </div>
      <Label
        for="integration-enabled"
        class="flex items-center justify-between rounded-md border p-3 text-sm"
        ><span
          ><span class="block font-medium">{{ t('wizard_template.enable_immediately') }}</span
          ><span class="text-muted-foreground">{{ t('wizard_template.enable_hint') }}</span></span
        ><Switch id="integration-enabled" v-model="enabled"
      /></Label>
    </div>
    <div v-else class="space-y-3">
      <Check class="size-8 text-chart-3" />
      <h2>{{ t('wizard_template.complete') }}</h2>
      <p class="text-sm text-muted-foreground">
        {{
          t('wizard_template.created_summary', {
            name: name || t('wizard_template.new_integration'),
            status: enabled ? t('common.enabled') : t('wizard_template.saved_disabled'),
          })
        }}
      </p>
    </div>
    <div class="mt-8 flex justify-between">
      <Button variant="outline" :disabled="step === 1" @click="step--"
        ><ChevronLeft class="size-4" />{{ t('common.previous') }}</Button
      ><Button v-if="step < 2" @click="next"
        >{{ t('common.next') }}<ChevronRight class="size-4" /></Button
      ><Button v-else-if="step === 2" @click="finish">{{ t('wizard_template.complete') }}</Button
      ><Button v-else @click="step = 1">{{ t('wizard_template.create_another') }}</Button>
    </div>
  </WizardPageTemplate>
</template>

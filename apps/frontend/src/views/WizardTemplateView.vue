<script setup lang="ts">
import { Check, ChevronLeft, ChevronRight } from '@lucide/vue'
import { toast } from 'vue-sonner'

import WizardPageTemplate from '@/components/templates/WizardPageTemplate.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

const step = ref(1); const name = ref(''); const endpoint = ref(''); const enabled = ref(true)
const labels = ['基本信息', '连接配置', '完成']
function next() { if (step.value === 1 && !name.value.trim()) return toast.error('请输入名称'); if (step.value === 2 && !endpoint.value.trim()) return toast.error('请输入服务地址'); step.value++ }
function finish() { toast.success('集成已创建'); step.value = 3 }
</script>

<template>
  <WizardPageTemplate title="创建集成" description="分步表单、字段校验、草稿和完成状态模板。"><template #steps><Stepper v-model="step" class="
    grid grid-cols-3 gap-2
  "><StepperItem v-for="(label, index) in labels" :key="label" :step="index + 1" class="
    relative min-w-0
  "><StepperTrigger class="w-full"><StepperIndicator><Check v-if="index + 1 < step" class="
    size-3
  " /><span v-else>{{ index + 1 }}</span></StepperIndicator><StepperTitle class="
    text-xs
  ">{{ label }}</StepperTitle></StepperTrigger><StepperSeparator v-if="index < labels.length - 1" class="
    absolute top-4 right-[calc(-50%+1rem)] left-[calc(50%+1rem)] h-px
  " /></StepperItem></Stepper></template><div v-if="step === 1" class="
    space-y-4
  "><h2>基本信息</h2><Input v-model="name" placeholder="集成名称" /><Textarea placeholder="用途说明（可选）" /></div><div v-else-if="step === 2" class="
    space-y-4
  "><h2>连接配置</h2><Input v-model="endpoint" placeholder="https://api.example.com" /><label class="
    flex items-center justify-between rounded-md border p-3 text-sm
  "><span><span class="block font-medium">创建后立即启用</span><span class="
    text-muted-foreground
  ">允许此集成接收请求。</span></span><Switch v-model="enabled" /></label></div><div v-else class="
    space-y-3
  "><Check class="size-8 text-chart-3" /><h2>配置完成</h2><p class="
    text-sm text-muted-foreground
  ">{{ name || '新集成' }} 已创建并{{ enabled ? '启用' : '保存为停用状态' }}。</p></div><div class="
    mt-8 flex justify-between
  "><Button variant="outline" :disabled="step === 1" @click="step--"><ChevronLeft class="
    size-4
  " /> 上一步</Button><Button v-if="step < 2" @click="next">下一步 <ChevronRight class="
    size-4
  " /></Button><Button v-else-if="step === 2" @click="finish">完成创建</Button><Button v-else @click="step = 1">再建一个</Button></div></WizardPageTemplate>
</template>

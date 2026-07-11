<script setup lang="ts">
import {
  Bell,
  Check,
  Command,
  Download,
  FileUp,
  LoaderCircle,
  Search,
  Settings2,
} from '@lucide/vue'
import { toast } from 'vue-sonner'

import PageShell from '@/components/common/PageShell.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxViewport,
} from '@/components/ui/combobox'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

const commandOpen = ref(false)
const notificationsOpen = ref(false)
const selectedService = ref('')
const form = reactive({ name: '生产环境网关', description: '', enabled: true })
const dirty = ref(false)
const saving = ref(false)
const importProgress = ref(0)
const importFile = ref('')
const loading = ref(false)
const failed = ref(false)
const services = ['用户服务', '订单服务', '通知服务', '分析服务']

watch(
  form,
  () => {
    dirty.value = true
  },
  { deep: true }
)
async function save() {
  saving.value = true
  await new Promise((resolve) => setTimeout(resolve, 400))
  saving.value = false
  dirty.value = false
  toast.success('更改已自动保存')
}
function selectFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  importFile.value = file.name
  importProgress.value = 0
  const timer = setInterval(() => {
    importProgress.value += 20
    if (importProgress.value >= 100) {
      clearInterval(timer)
      toast.success('导入完成，可查看结果摘要')
    }
  }, 120)
}
async function reload() {
  loading.value = true
  failed.value = false
  await new Promise((resolve) => setTimeout(resolve, 450))
  loading.value = false
}
</script>

<template>
  <PageShell title="操作模式" description="表单、选择、导入、反馈与全局工具的可复用交互模板。">
    <template #actions>
      <Button variant="outline" size="sm" @click="commandOpen = true"
        ><Command class="size-4" /> 命令面板</Button
      >
      <Popover v-model:open="notificationsOpen"
        ><PopoverTrigger as-child
          ><Button variant="outline" size="icon"><Bell class="size-4" /></Button></PopoverTrigger
        ><PopoverContent class="w-80"
          ><p class="font-medium">通知中心</p>
          <div class="mt-3 space-y-3 text-sm">
            <p>生产环境网关恢复正常</p>
            <p>数据导入任务已完成</p>
          </div></PopoverContent
        ></Popover
      >
    </template>
    <div class="grid gap-6 xl:grid-cols-2">
      <section class="space-y-6">
        <div class="rounded-lg border bg-card p-6">
          <div class="flex items-center justify-between">
            <div>
              <h2>高级表单编辑</h2>
              <p class="mt-1 text-sm text-muted-foreground">支持自动保存、脏状态和危险操作区域。</p>
            </div>
            <span class="text-xs text-muted-foreground">{{
              saving ? '保存中...' : dirty ? '有未保存更改' : '已保存'
            }}</span>
          </div>
          <div class="mt-5 space-y-4">
            <Input v-model="form.name" placeholder="资源名称" /><Textarea
              v-model="form.description"
              placeholder="用途说明"
            /><label class="flex items-center justify-between rounded-md border p-3 text-sm"
              ><span
                ><span class="block font-medium">启用服务</span
                ><span class="text-muted-foreground">允许外部请求访问。</span></span
              ><Switch v-model="form.enabled"
            /></label>
            <div class="flex justify-between border-t pt-4">
              <Button variant="destructive" size="sm" @click="toast.error('危险操作需要二次确认')"
                >删除资源</Button
              ><Button size="sm" :disabled="!dirty || saving" @click="save">保存更改</Button>
            </div>
          </div>
        </div>
        <div class="rounded-lg border bg-card p-6">
          <h2>远程搜索选择</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            适合关联资源、负责人和标签等异步选择场景。
          </p>
          <Combobox v-model="selectedService" class="mt-4"
            ><ComboboxAnchor><ComboboxInput placeholder="搜索服务" /></ComboboxAnchor
            ><ComboboxList
              ><ComboboxViewport
                ><ComboboxItem v-for="service in services" :key="service" :value="service">{{
                  service
                }}</ComboboxItem
                ><ComboboxEmpty>没有匹配的服务</ComboboxEmpty></ComboboxViewport
              ></ComboboxList
            ></Combobox
          >
          <p v-if="selectedService" class="mt-3 text-sm text-muted-foreground">
            当前选择：{{ selectedService }}
          </p>
        </div>
      </section>
      <section class="space-y-6">
        <div class="rounded-lg border bg-card p-6">
          <div class="flex items-start justify-between">
            <div>
              <h2>导入与导出</h2>
              <p class="mt-1 text-sm text-muted-foreground">文件选择、进度、结果反馈与错误重试。</p>
            </div>
            <Button variant="outline" size="sm" @click="toast.success('示例数据已导出')"
              ><Download class="size-4" /> 导出</Button
            >
          </div>
          <div class="mt-5 rounded-md border border-dashed p-4">
            <Input type="file" accept=".csv,.xlsx" @change="selectFile" />
            <div v-if="importFile" class="mt-4 space-y-2 text-sm">
              <div class="flex justify-between">
                <span>{{ importFile }}</span
                ><span>{{ importProgress }}%</span>
              </div>
              <Progress :model-value="importProgress" />
            </div>
          </div>
        </div>
        <div class="rounded-lg border bg-card p-6">
          <div class="flex items-center justify-between">
            <div>
              <h2>加载与反馈状态</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                空状态、骨架、失败重试应成为页面默认能力。
              </p>
            </div>
            <div class="flex gap-2">
              <Button variant="outline" size="sm" @click="failed = true">模拟失败</Button
              ><Button variant="outline" size="sm" @click="reload"
                ><LoaderCircle class="size-4" :class="loading ? `animate-spin` : ''" /> 重试</Button
              >
            </div>
          </div>
          <div class="mt-5 space-y-3">
            <template v-if="loading"
              ><Skeleton class="h-5 w-3/5" /><Skeleton class="h-5 w-full" /><Skeleton
                class="h-5 w-4/5" /></template
            ><Alert v-else-if="failed" variant="destructive"
              ><AlertTitle>加载失败</AlertTitle
              ><AlertDescription>网络请求未完成，请重试。</AlertDescription></Alert
            ><Alert v-else
              ><Check class="size-4" /><AlertTitle>数据已就绪</AlertTitle
              ><AlertDescription
                >这里可以替换为真实数据、空状态或错误状态。</AlertDescription
              ></Alert
            >
          </div>
        </div>
      </section>
    </div>
  </PageShell>
  <CommandDialog v-model:open="commandOpen">
    <CommandInput placeholder="搜索命令或页面" />
    <CommandList>
      <CommandEmpty>没有匹配的命令</CommandEmpty>
      <CommandGroup heading="快速操作">
        <CommandItem value="create" @select="toast.success('已打开创建表单'); commandOpen = false">
          <FileUp /> 新建资源
        </CommandItem>
        <CommandItem value="settings" @select="toast.success('已打开设置'); commandOpen = false">
          <Settings2 /> 打开设置
        </CommandItem>
        <CommandItem value="search" @select="toast.success('已聚焦搜索'); commandOpen = false">
          <Search /> 搜索成员
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>

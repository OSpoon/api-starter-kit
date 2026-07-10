<script setup lang="ts">
import {
  Activity,
  ArrowUpRight,
  Bell,
  Boxes,
  CheckCircle2,
  Copy,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from '@lucide/vue'
import { toast } from 'vue-sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import DashboardPageTemplate from '@/components/templates/DashboardPageTemplate.vue'
import DetailPageTemplate from '@/components/templates/DetailPageTemplate.vue'
import SettingsPageTemplate from '@/components/templates/SettingsPageTemplate.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { copyText } from '@/lib/clipboard'

type TemplateName = 'overview' | 'detail' | 'settings'
type Member = { id: number; name: string; initials: string; role: string; status: '已启用' | '待邀请' }

const { t } = useI18n()
const activeTemplate = ref<TemplateName>('overview')
const searchTerm = ref('')
const members = ref<Member[]>([
  { id: 1, name: 'Chen Yu', initials: 'CY', role: '管理员', status: '已启用' },
  { id: 2, name: 'Lin An', initials: 'LA', role: '开发者', status: '已启用' },
  { id: 3, name: 'Zhang Wei', initials: 'ZW', role: '只读成员', status: '待邀请' },
])
const resource = reactive({ name: '生产环境 API', endpoint: 'api.example.com/v1', description: '对外提供稳定的生产环境接口。' })
const notificationsEnabled = ref(true)
const weeklyDigestEnabled = ref(false)
const settingsDirty = ref(false)
const channels = ref<string[]>([])
const createDialogOpen = ref(false)
const editDialogOpen = ref(false)
const channelDialogOpen = ref(false)
const deleteDialogOpen = ref(false)
const memberToDelete = ref<Member | null>(null)
const newMember = reactive({ name: '', role: '开发者' })
const newChannel = ref('')

const metrics = computed(() => [
  { label: '本周请求', value: '12,840', trend: '+18.2%', icon: Activity },
  { label: '活跃成员', value: String(members.value.filter((member) => member.status === '已启用').length), trend: `共 ${members.value.length} 人`, icon: Users },
  { label: '服务可用性', value: '99.98%', trend: '正常', icon: CheckCircle2 },
  { label: '已接入服务', value: '8', trend: '全部在线', icon: Boxes },
])

const filteredMembers = computed(() => {
  const keyword = searchTerm.value.trim().toLowerCase()
  return keyword ? members.value.filter((member) => `${member.name}${member.role}`.toLowerCase().includes(keyword)) : members.value
})

function initialsFor(name: string) {
  return name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'NA'
}

function createMember() {
  const name = newMember.name.trim()
  if (!name) {
    toast.error('请输入成员名称')
    return
  }

  members.value.unshift({ id: Date.now(), name, initials: initialsFor(name), role: newMember.role, status: '待邀请' })
  newMember.name = ''
  newMember.role = '开发者'
  createDialogOpen.value = false
  toast.success('邀请已创建')
}

function requestDelete(member: Member) {
  memberToDelete.value = member
  deleteDialogOpen.value = true
}

function deleteMember() {
  if (!memberToDelete.value) return
  members.value = members.value.filter((member) => member.id !== memberToDelete.value?.id)
  deleteDialogOpen.value = false
  toast.success('成员已移除')
  memberToDelete.value = null
}

function openMember(member: Member) {
  activeTemplate.value = 'detail'
  toast.success(`已打开 ${member.name} 的详情`)
}

async function copyEndpoint() {
  await copyText(resource.endpoint)
  toast.success('服务地址已复制')
}

function saveResource() {
  editDialogOpen.value = false
  toast.success('资源信息已保存')
}

function showLogs() {
  toast.success('日志查询已加入示例队列')
}

function markSettingsDirty() {
  settingsDirty.value = true
}

function saveSettings() {
  settingsDirty.value = false
  toast.success('通知设置已保存')
}

function addChannel() {
  const channel = newChannel.value.trim()
  if (!channel) {
    toast.error('请输入通知渠道名称')
    return
  }

  channels.value.push(channel)
  newChannel.value = ''
  channelDialogOpen.value = false
  settingsDirty.value = true
  toast.success('通知渠道已添加')
}
</script>

<template>
  <DashboardPageTemplate v-if="activeTemplate === 'overview'" :title="t('page_templates.title')" :description="t('page_templates.desc')">
    <template #actions>
      <Button variant="outline" size="sm" @click="activeTemplate = 'detail'">查看详情</Button>
      <Button variant="outline" size="sm" @click="activeTemplate = 'settings'">查看设置</Button>
      <Button size="sm" @click="createDialogOpen = true"><Plus class="size-4" /> 新建成员</Button>
    </template>
    <template #metrics>
      <Card v-for="metric in metrics" :key="metric.label"><CardHeader class="
        flex flex-row items-center justify-between space-y-0 pb-2
      "><CardDescription>{{ metric.label }}</CardDescription><component :is="metric.icon" class="
        size-4 text-muted-foreground
      " /></CardHeader><CardContent><div class="text-2xl font-semibold">{{ metric.value }}</div><p class="
        mt-1 text-xs text-muted-foreground
      ">{{ metric.trend }}</p></CardContent></Card>
    </template>

    <Card><CardHeader class="
      flex flex-col gap-4
      sm:flex-row sm:items-center sm:justify-between
    "><div><CardTitle>成员列表</CardTitle><CardDescription>可搜索、新建、查看和移除的资源列表示例。</CardDescription></div><div class="
      relative w-full
      sm:w-52
    "><Search class="
      pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground
    " /><Input v-model="searchTerm" class="pl-9" placeholder="搜索成员" /></div></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>成员</TableHead><TableHead>角色</TableHead><TableHead>状态</TableHead><TableHead class="
      w-12
    " /></TableRow></TableHeader><TableBody><TableRow v-for="member in filteredMembers" :key="member.id"><TableCell><div class="
      flex items-center gap-3
    "><Avatar class="size-8"><AvatarFallback>{{ member.initials }}</AvatarFallback></Avatar><span class="
      font-medium
    ">{{ member.name }}</span></div></TableCell><TableCell>{{ member.role }}</TableCell><TableCell><Badge variant="outline" :class="member.status === '已启用' ? `
      border-chart-3/30 bg-chart-3/10 text-chart-3
    ` : ''">{{ member.status }}</Badge></TableCell><TableCell><DropdownMenu><DropdownMenuTrigger as-child><Button variant="ghost" size="icon" class="
      size-8
    "><MoreHorizontal class="size-4" /><span class="sr-only">成员操作</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem @select="openMember(member)"><ArrowUpRight /> 查看详情</DropdownMenuItem><DropdownMenuItem @select="toast.success('编辑表单已准备就绪')"><Pencil /> 编辑角色</DropdownMenuItem><DropdownMenuItem variant="destructive" @select="requestDelete(member)"><Trash2 /> 移除成员</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow><TableRow v-if="filteredMembers.length === 0"><TableCell colspan="4" class="
      py-10 text-center text-sm text-muted-foreground
    ">没有匹配的成员</TableCell></TableRow></TableBody></Table></CardContent></Card>

    <template #aside><Card><CardHeader><CardTitle class="text-base">容量使用</CardTitle><CardDescription>本月配额</CardDescription></CardHeader><CardContent class="
      space-y-3
    "><div class="flex justify-between text-sm"><span>API 请求</span><span class="
      text-muted-foreground
    ">68%</span></div><Progress :model-value="68" /><p class="
      text-xs text-muted-foreground
    ">68,000 / 100,000 请求</p></CardContent></Card><Alert><Bell class="size-4" /><AlertTitle>维护通知</AlertTitle><AlertDescription>下次维护窗口为周日 02:00 - 03:00。</AlertDescription></Alert></template>
  </DashboardPageTemplate>

  <DetailPageTemplate v-else-if="activeTemplate === 'detail'" title="资源详情" description="适合展示单一对象、活动记录和关联操作。"><template #actions><Button variant="outline" size="sm" @click="activeTemplate = 'overview'">返回概览</Button><Button variant="outline" size="sm" @click="activeTemplate = 'settings'">通知设置</Button><Button size="sm" @click="editDialogOpen = true"><Pencil class="
    size-4
  " /> 编辑资源</Button></template><Card><CardHeader><CardTitle>{{ resource.name }}</CardTitle><CardDescription>{{ resource.description }}</CardDescription></CardHeader><CardContent class="
    grid gap-4
    sm:grid-cols-2
  "><div><p class="text-xs text-muted-foreground">服务地址</p><p class="
    mt-1 font-mono text-sm
  ">{{ resource.endpoint }}</p></div><div><p class="
    text-xs text-muted-foreground
  ">当前状态</p><Badge class="mt-1" variant="secondary">运行中</Badge></div></CardContent></Card><Card><CardHeader><CardTitle>最近活动</CardTitle></CardHeader><CardContent class="
    space-y-1
  "><Item v-for="member in members" :key="member.id" size="sm"><ItemMedia variant="icon"><CheckCircle2 /></ItemMedia><ItemContent><ItemTitle>{{ member.name }} 更新了访问权限</ItemTitle><ItemDescription>今天 10:24</ItemDescription></ItemContent><ItemActions><Button variant="ghost" size="icon" class="
    size-8
  " @click="openMember(member)"><ArrowUpRight class="size-4" /></Button></ItemActions></Item></CardContent></Card><template #aside><Card><CardHeader><CardTitle class="
    text-base
  ">快捷操作</CardTitle></CardHeader><CardContent class="space-y-2"><Button class="
    w-full justify-start
  " variant="outline" @click="copyEndpoint"><Copy class="size-4" /> 复制地址</Button><Button class="
    w-full justify-start
  " variant="outline" @click="showLogs"><FileText class="size-4" /> 查看日志</Button></CardContent></Card></template></DetailPageTemplate>

  <SettingsPageTemplate v-else title="通知设置" description="适合系统、账户和工作区的分组配置。"><template #actions><Button variant="outline" size="sm" @click="activeTemplate = 'overview'">返回概览</Button><Button size="sm" :disabled="!settingsDirty" @click="saveSettings">保存更改</Button></template><template #navigation><div class="
    space-y-1
  "><Button class="w-full justify-start" variant="secondary">常规设置</Button><Button class="
    w-full justify-start
  " variant="ghost">通知</Button><Button class="w-full justify-start" variant="ghost">成员与权限</Button></div></template><Card><CardHeader><CardTitle>邮件通知</CardTitle><CardDescription>选择需要通过邮件接收的系统事件。</CardDescription></CardHeader><CardContent class="
    space-y-1
  "><Item variant="outline"><ItemContent><ItemTitle>服务异常</ItemTitle><ItemDescription>服务健康检查失败或恢复时通知我。</ItemDescription></ItemContent><ItemActions><Switch v-model="notificationsEnabled" @update:model-value="markSettingsDirty" /></ItemActions></Item><Item variant="outline"><ItemContent><ItemTitle>每周摘要</ItemTitle><ItemDescription>每周一发送工作区活跃度摘要。</ItemDescription></ItemContent><ItemActions><Switch v-model="weeklyDigestEnabled" @update:model-value="markSettingsDirty" /></ItemActions></Item></CardContent></Card><Card v-if="channels.length"><CardHeader><CardTitle>已接入渠道</CardTitle><CardDescription>保存设置后会同步生效。</CardDescription></CardHeader><CardContent class="
    space-y-2
  "><Item v-for="channel in channels" :key="channel" variant="outline"><ItemMedia variant="icon"><Bell /></ItemMedia><ItemContent><ItemTitle>{{ channel }}</ItemTitle><ItemDescription>已启用</ItemDescription></ItemContent></Item></CardContent></Card><Empty v-else><EmptyHeader><EmptyMedia variant="icon"><Bell /></EmptyMedia><EmptyTitle>暂无其他通知渠道</EmptyTitle><EmptyDescription>可以在这里接入 Webhook 或企业消息通知。</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" size="sm" @click="channelDialogOpen = true">添加渠道</Button></EmptyContent></Empty></SettingsPageTemplate>

  <Dialog v-model:open="createDialogOpen"><DialogContent><DialogHeader><DialogTitle>新建成员</DialogTitle><DialogDescription>创建后成员会以待邀请状态出现在列表中。</DialogDescription></DialogHeader><div class="
    space-y-4
  "><Input v-model="newMember.name" placeholder="成员名称" @keydown.enter="createMember" /><Input v-model="newMember.role" placeholder="角色" @keydown.enter="createMember" /></div><DialogFooter><Button variant="outline" @click="createDialogOpen = false">取消</Button><Button @click="createMember">创建邀请</Button></DialogFooter></DialogContent></Dialog>
  <Dialog v-model:open="editDialogOpen"><DialogContent><DialogHeader><DialogTitle>编辑资源</DialogTitle><DialogDescription>本地状态立即更新，作为提交表单的参考。</DialogDescription></DialogHeader><div class="
    space-y-4
  "><Input v-model="resource.name" placeholder="资源名称" /><Input v-model="resource.endpoint" placeholder="服务地址" /><Textarea v-model="resource.description" placeholder="资源说明" /></div><DialogFooter><Button variant="outline" @click="editDialogOpen = false">取消</Button><Button @click="saveResource">保存资源</Button></DialogFooter></DialogContent></Dialog>
  <Dialog v-model:open="channelDialogOpen"><DialogContent><DialogHeader><DialogTitle>添加通知渠道</DialogTitle><DialogDescription>请输入渠道名称，例如“生产环境 Webhook”。</DialogDescription></DialogHeader><Input v-model="newChannel" placeholder="渠道名称" @keydown.enter="addChannel" /><DialogFooter><Button variant="outline" @click="channelDialogOpen = false">取消</Button><Button @click="addChannel">添加渠道</Button></DialogFooter></DialogContent></Dialog>
  <ConfirmDialog v-model:open="deleteDialogOpen" title="移除成员" :description="`确定要移除 ${memberToDelete?.name ?? '该成员'} 吗？`" confirm-label="移除" @confirm="deleteMember" />
</template>

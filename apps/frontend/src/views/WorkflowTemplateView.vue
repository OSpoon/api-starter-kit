<script setup lang="ts">
import { Check, Clock3, MessageSquare, Send, X } from '@lucide/vue'
import { toast } from 'vue-sonner'

import WorkflowPageTemplate from '@/components/templates/WorkflowPageTemplate.vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Textarea } from '@/components/ui/textarea'

const status = ref<'待审批' | '已批准' | '已拒绝'>('待审批')
const comment = ref('')
const comments = ref<string[]>(['已核对生产环境变更范围。'])
function decide(next: '已批准' | '已拒绝') { status.value = next; toast.success(`申请已${next}`) }
function addComment() { if (!comment.value.trim()) return; comments.value.push(comment.value.trim()); comment.value = ''; toast.success('评论已添加') }
</script>

<template>
  <WorkflowPageTemplate title="发布审批" description="任务、审批和工单等状态流转模板。"><template #actions><Button variant="outline" size="sm" :disabled="status !== '待审批'" @click="decide('已拒绝')"><X class="
    size-4
  " /> 拒绝</Button><Button size="sm" :disabled="status !== '待审批'" @click="decide('已批准')"><Check class="
    size-4
  " /> 批准</Button></template><Card><CardHeader><div class="
    flex items-start justify-between gap-4
  "><div><CardTitle>生产环境配置变更</CardTitle><CardDescription>申请人：Lin An · 提交于今天 09:42</CardDescription></div><Badge variant="outline">{{ status }}</Badge></div></CardHeader><CardContent class="
    space-y-4
  "><p class="text-sm text-muted-foreground">更新网关路由规则，并在发布后监控 30 分钟错误率。</p><div class="
    rounded-md border bg-muted/30 p-3 text-sm
  ">变更窗口：2026-07-10 22:00 - 22:30</div></CardContent></Card><Card><CardHeader><CardTitle>讨论</CardTitle></CardHeader><CardContent class="
    space-y-4
  "><Item v-for="(item, index) in comments" :key="index" variant="outline"><ItemMedia><Avatar class="
    size-8
  "><AvatarFallback>CY</AvatarFallback></Avatar></ItemMedia><ItemContent><ItemTitle>Chen Yu</ItemTitle><ItemDescription>{{ item }}</ItemDescription></ItemContent></Item><div class="
    space-y-2
  "><Textarea v-model="comment" placeholder="添加评论" /><Button size="sm" :disabled="!comment.trim()" @click="addComment"><Send class="
    size-4
  " /> 发送评论</Button></div></CardContent></Card><template #aside><Card><CardHeader><CardTitle class="
    text-base
  ">审批进度</CardTitle></CardHeader><CardContent class="space-y-4"><div class="
    flex gap-3 text-sm
  "><Clock3 class="mt-0.5 size-4 text-muted-foreground" /><div><p class="
    font-medium
  ">已提交</p><p class="text-muted-foreground">今天 09:42</p></div></div><div class="
    flex gap-3 text-sm
  "><MessageSquare class="mt-0.5 size-4 text-muted-foreground" /><div><p class="
    font-medium
  ">等待处理</p><p class="text-muted-foreground">当前审批人：Chen Yu</p></div></div></CardContent></Card></template></WorkflowPageTemplate>
</template>

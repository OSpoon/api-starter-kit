<script setup lang="ts">
import { Check, Clock3, MessageSquare, Send, X } from '@lucide/vue'
import { toast } from 'vue-sonner'

import WorkflowPageTemplate from '@/components/templates/WorkflowPageTemplate.vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const { t } = useI18n()
const status = ref<'pending' | 'approved' | 'rejected'>('pending')
const comment = ref('')
const comments = ref<string[]>([t('workflow_template.initial_comment')])
const statusLabel = computed(() => t(`workflow_template.${status.value}`))
function decide(next: 'approved' | 'rejected') {
  status.value = next
  toast.success(t('workflow_template.request_updated', { status: t(`workflow_template.${next}`) }))
}
function addComment() {
  if (!comment.value.trim()) return
  comments.value.push(comment.value.trim())
  comment.value = ''
  toast.success(t('workflow_template.comment_added'))
}
</script>

<template>
  <WorkflowPageTemplate
    :title="t('workflow_template.title')"
    :description="t('workflow_template.description')"
  >
    <template #actions
      ><Button
        variant="outline"
        size="sm"
        :disabled="status !== 'pending'"
        @click="decide('rejected')"
        ><X class="size-4" />{{ t('workflow_template.reject') }}</Button
      ><Button size="sm" :disabled="status !== 'pending'" @click="decide('approved')"
        ><Check class="size-4" />{{ t('workflow_template.approve') }}</Button
      ></template
    >
    <Card
      ><CardHeader
        ><div class="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{{ t('workflow_template.request_title') }}</CardTitle
            ><CardDescription>{{ t('workflow_template.request_meta') }}</CardDescription>
          </div>
          <Badge variant="outline">{{ statusLabel }}</Badge>
        </div></CardHeader
      ><CardContent class="space-y-4"
        ><p class="text-sm text-muted-foreground">
          {{ t('workflow_template.request_description') }}
        </p>
        <div class="rounded-md border bg-muted/30 p-3 text-sm">
          {{ t('workflow_template.window') }}
        </div></CardContent
      ></Card
    >
    <Card
      ><CardHeader
        ><CardTitle>{{ t('workflow_template.discussion') }}</CardTitle></CardHeader
      ><CardContent class="space-y-4"
        ><Item v-for="(item, index) in comments" :key="index" variant="outline"
          ><ItemMedia
            ><Avatar class="size-8"><AvatarFallback>CY</AvatarFallback></Avatar></ItemMedia
          ><ItemContent
            ><ItemTitle>Chen Yu</ItemTitle
            ><ItemDescription>{{ item }}</ItemDescription></ItemContent
          ></Item
        >
        <div class="grid gap-2">
          <Label for="workflow-comment">{{ t('workflow_template.comment') }}</Label
          ><Textarea
            id="workflow-comment"
            v-model="comment"
            :placeholder="t('workflow_template.comment_placeholder')"
          /><Button size="sm" :disabled="!comment.trim()" @click="addComment"
            ><Send class="size-4" />{{ t('workflow_template.send_comment') }}</Button
          >
        </div></CardContent
      ></Card
    >
    <template #aside
      ><Card
        ><CardHeader
          ><CardTitle class="text-base">{{
            t('workflow_template.progress')
          }}</CardTitle></CardHeader
        ><CardContent class="space-y-4"
          ><div class="flex gap-3 text-sm">
            <Clock3 class="mt-0.5 size-4 text-muted-foreground" />
            <div>
              <p class="font-medium">{{ t('workflow_template.submitted') }}</p>
              <p class="text-muted-foreground">{{ t('workflow_template.request_meta') }}</p>
            </div>
          </div>
          <div class="flex gap-3 text-sm">
            <MessageSquare class="mt-0.5 size-4 text-muted-foreground" />
            <div>
              <p class="font-medium">{{ t('workflow_template.waiting') }}</p>
              <p class="text-muted-foreground">{{ t('workflow_template.current_approver') }}</p>
            </div>
          </div></CardContent
        ></Card
      ></template
    >
  </WorkflowPageTemplate>
</template>

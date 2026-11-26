import { test } from '@japa/runner'
import { DateTime } from 'luxon'

import type AiAutomation from '#models/ai_automation'
import type AiAutomationRun from '#models/ai_automation_run'
import { createWebhookBody } from '#services/ai_automation_delivery_service'

const run = {
  id: 17,
  automationId: 4,
  automationName: '每日摘要',
  scheduledFor: DateTime.fromISO('2026-11-26T01:00:00Z'),
  startedAt: DateTime.fromISO('2026-11-26T01:00:02Z'),
  completedAt: DateTime.fromISO('2026-11-26T01:00:08Z'),
} satisfies Pick<
  AiAutomationRun,
  'id' | 'automationId' | 'automationName' | 'scheduledFor' | 'startedAt' | 'completedAt'
>

test.group('AI automation webhook delivery', () => {
  test('builds a generic JSON event', ({ assert }) => {
    const body = JSON.parse(
      createWebhookBody({
        automation: { webhookType: 'generic' } satisfies Pick<AiAutomation, 'webhookType'>,
        run,
        status: 'completed',
        summary: '运行完成',
      })
    )

    assert.equal(body.event, 'ai.automation.run.completed')
    assert.equal(body.runId, 17)
    assert.equal(body.automationId, 4)
    assert.equal(body.summary, '运行完成')
    assert.equal(body.error, null)
  })

  test('builds a WeCom text message within the byte limit', ({ assert }) => {
    const body = JSON.parse(
      createWebhookBody({
        automation: { webhookType: 'wecom' } satisfies Pick<AiAutomation, 'webhookType'>,
        run,
        status: 'failed',
        summary: '🙂'.repeat(3_000),
        error: '模型暂时不可用',
      })
    ) as { msgtype: string; text: { content: string } }

    assert.equal(body.msgtype, 'text')
    assert.include(body.text.content, '任务：每日摘要')
    assert.include(body.text.content, '状态：失败')
    assert.include(body.text.content, '错误：模型暂时不可用')
    assert.isAtMost(Buffer.byteLength(body.text.content), 2_048)
    assert.isTrue(body.text.content.endsWith('…'))
  })
})

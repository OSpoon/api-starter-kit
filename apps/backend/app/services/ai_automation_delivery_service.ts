import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'

import encryption from '@adonisjs/core/services/encryption'

import type AiAutomation from '#models/ai_automation'
import type { AiAutomationWebhookType } from '#models/ai_automation'
import type AiAutomationRun from '#models/ai_automation_run'

function truncateUtf8(value: string, maxBytes: number) {
  let result = ''
  let size = 0
  for (const character of value) {
    const characterSize = Buffer.byteLength(character)
    if (size + characterSize > maxBytes - 3) return `${result}…`
    result += character
    size += characterSize
  }
  return result
}

export function createWebhookBody(input: {
  automation: Pick<AiAutomation, 'webhookType'>
  run: Pick<
    AiAutomationRun,
    'id' | 'automationId' | 'automationName' | 'scheduledFor' | 'startedAt' | 'completedAt'
  >
  status: 'completed' | 'failed'
  summary: string
  error?: string | null
}) {
  if (input.automation.webhookType === 'wecom') {
    const lines = [
      `任务：${input.run.automationName}`,
      `状态：${input.status === 'completed' ? '完成' : '失败'}`,
      `运行编号：${input.run.id}`,
      ...(input.error ? [`错误：${input.error}`] : []),
      ...(input.summary.trim() ? [`结果：${input.summary.trim()}`] : []),
    ]
    return JSON.stringify({
      msgtype: 'text',
      text: { content: truncateUtf8(lines.join('\n'), 2_048) },
    })
  }

  return JSON.stringify({
    event: `ai.automation.run.${input.status}`,
    runId: input.run.id,
    automationId: input.run.automationId,
    automationName: input.run.automationName,
    status: input.status,
    scheduledFor: input.run.scheduledFor.toISO(),
    startedAt: input.run.startedAt?.toISO() ?? null,
    completedAt: input.run.completedAt?.toISO() ?? null,
    summary: input.summary,
    error: input.error ?? null,
  })
}

async function postWebhook(
  urlValue: string,
  body: string,
  runId: number,
  webhookType: AiAutomationWebhookType
) {
  const url = new URL(urlValue)
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const pathname = `${url.pathname}${url.search}`

  await new Promise<void>((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: 'https:',
        hostname,
        port: url.port ? Number(url.port) : 443,
        servername: isIP(hostname) ? undefined : hostname,
        path: pathname,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'x-automation-run-id': String(runId),
        },
      },
      (response) => {
        let responseBytes = 0
        const responseChunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => {
          responseBytes += chunk.length
          if (responseBytes > 8_192) request.destroy(new Error('Webhook response was too large'))
          else if (webhookType === 'wecom') responseChunks.push(chunk)
        })
        response.on('end', () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Webhook returned HTTP ${response.statusCode ?? 'unknown'}`))
            return
          }
          if (webhookType === 'wecom') {
            let responseResult: unknown
            try {
              responseResult = JSON.parse(Buffer.concat(responseChunks).toString('utf8'))
            } catch {
              reject(new Error('企业微信返回了无效响应'))
              return
            }
            if (
              !responseResult ||
              typeof responseResult !== 'object' ||
              !('errcode' in responseResult)
            ) {
              reject(new Error('企业微信返回了无效响应'))
              return
            }
            const result = responseResult as { errcode: unknown; errmsg?: unknown }
            if (result.errcode !== 0) {
              const message = typeof result.errmsg === 'string' ? `：${result.errmsg}` : ''
              reject(new Error(`企业微信返回错误 ${String(result.errcode ?? 'unknown')}${message}`))
              return
            }
          }
          resolve()
        })
      }
    )
    request.setTimeout(10_000, () => request.destroy(new Error('Webhook request timed out')))
    request.once('error', reject)
    request.end(body)
  })
}

export async function deliverAiAutomationRun(input: {
  automation: AiAutomation
  run: AiAutomationRun
  status: 'completed' | 'failed'
  summary: string
  error?: string | null
}) {
  const results: NonNullable<AiAutomationRun['deliveryResults']> = {}
  let webhookUrl: string | null = null
  try {
    webhookUrl = input.automation.encryptedWebhookUrl
      ? encryption.decrypt<string>(input.automation.encryptedWebhookUrl)
      : null
  } catch {
    // Keep delivery failures independent from the AI run result.
  }
  const payload = createWebhookBody(input)

  if (input.automation.encryptedWebhookUrl && !webhookUrl) {
    results.webhook = { status: 'failed', error: 'Webhook 配置无法解密，请重新配置' }
  } else if (webhookUrl) {
    try {
      await postWebhook(webhookUrl, payload, input.run.id, input.automation.webhookType)
      results.webhook = { status: 'sent' }
    } catch (error) {
      results.webhook = {
        status: 'failed',
        error: error instanceof Error ? error.message.slice(0, 300) : 'Webhook 投递失败',
      }
    }
  }
  return results
}

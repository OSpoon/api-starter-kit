import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import { getAiUsageOverview } from '#services/ai_usage_service'
import { readSystemStatus } from '#services/system_status_service'

import { dataEnvelope } from '../openapi/response_schemas.js'

@ApiSecurity('bearerAuth')
export default class SystemStatusController {
  @ApiOperation({
    summary: '获取服务器状态',
    description: '返回服务器资源、当前应用运行时，以及企业微信、飞书和钉钉 Bot worker 进程状态。',
  })
  @ApiResponse({
    status: 200,
    description:
      '服务器状态快照；diskCollectionAvailable 为 false 时磁盘采集失败，此时 disks 为空数组；diskCollectionAvailable 为 true 且 disks 为空时没有可用挂载点。IM Bot 状态依据最近 30 秒的数据库心跳判断，只反映进程存活。CPU 首次采样时使用率为空，运行时无法读取的物理核数或活动句柄计数也为空。',
    schema: dataEnvelope({
      type: 'object',
      required: [
        'cpu',
        'memory',
        'disks',
        'diskCollectionAvailable',
        'runtime',
        'imBots',
        'updatedAt',
      ],
      properties: {
        cpu: {
          type: 'object',
          required: [
            'averagePercent',
            'perCorePercent',
            'logicalCores',
            'physicalCores',
            'loadAverage',
          ],
          properties: {
            averagePercent: { type: 'integer', nullable: true },
            perCorePercent: { type: 'array', items: { type: 'integer', nullable: true } },
            logicalCores: { type: 'integer' },
            physicalCores: { type: 'integer', nullable: true },
            loadAverage: { type: 'array', items: { type: 'number' } },
          },
        },
        memory: {
          type: 'object',
          required: ['usedPercent', 'usedGb', 'totalGb', 'availableGb'],
          properties: {
            usedPercent: { type: 'integer' },
            usedGb: { type: 'number' },
            totalGb: { type: 'number' },
            availableGb: { type: 'number' },
          },
        },
        disks: {
          type: 'array',
          items: {
            type: 'object',
            required: ['mount', 'usedPercent', 'usedBytes', 'totalBytes'],
            properties: {
              mount: { type: 'string' },
              usedPercent: { type: 'number' },
              usedBytes: { type: 'number' },
              totalBytes: { type: 'number' },
            },
          },
        },
        diskCollectionAvailable: { type: 'boolean' },
        runtime: {
          type: 'object',
          required: [
            'activeHandles',
            'pid',
            'uptimeSeconds',
            'rssMb',
            'heapUsedMb',
            'heapTotalMb',
            'nodeVersion',
            'v8Version',
            'platform',
            'osVersion',
          ],
          properties: {
            activeHandles: { type: 'integer', nullable: true },
            pid: { type: 'integer' },
            uptimeSeconds: { type: 'integer' },
            rssMb: { type: 'integer' },
            heapUsedMb: { type: 'integer' },
            heapTotalMb: { type: 'integer' },
            nodeVersion: { type: 'string' },
            v8Version: { type: 'string' },
            platform: { type: 'string' },
            osVersion: { type: 'string' },
          },
        },
        imBots: {
          type: 'array',
          items: {
            type: 'object',
            required: ['channel', 'status', 'pid', 'startedAt', 'lastHeartbeatAt'],
            properties: {
              channel: { type: 'string', enum: ['wecom', 'feishu', 'dingtalk'] },
              status: { type: 'string', enum: ['online', 'offline'] },
              pid: { type: 'integer', nullable: true },
              startedAt: { type: 'string', nullable: true, format: 'date-time' },
              lastHeartbeatAt: { type: 'string', nullable: true, format: 'date-time' },
            },
          },
        },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    }),
  })
  async show({ serialize }: HttpContext) {
    return serialize(await readSystemStatus())
  }

  @ApiOperation({
    summary: '获取 AI 服务概览',
    description: '返回当前月份全服务的模型调用次数、token 消耗和估算消费。',
  })
  @ApiResponse({
    status: 200,
    description: 'AI 服务概览',
    schema: dataEnvelope({
      type: 'object',
      required: [
        'period',
        'periodStart',
        'periodEnd',
        'totalTokens',
        'modelCalls',
        'estimatedCostUsd',
        'pricingSource',
        'unpricedModelCount',
      ],
      properties: {
        period: { type: 'string', enum: ['current_month'] },
        periodStart: { type: 'string', format: 'date-time' },
        periodEnd: { type: 'string', format: 'date-time' },
        totalTokens: { type: 'integer' },
        modelCalls: { type: 'integer' },
        estimatedCostUsd: { type: 'number', nullable: true },
        pricingSource: { type: 'string', enum: ['models.dev', 'mixed', 'unavailable'] },
        unpricedModelCount: { type: 'integer' },
      },
    }),
  })
  async aiOverview({ serialize }: HttpContext) {
    return serialize(await getAiUsageOverview())
  }
}

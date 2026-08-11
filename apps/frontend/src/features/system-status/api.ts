import { apiRequest } from '@/lib/api'
import { readItem } from '@/lib/api-types'

export interface SystemStatus {
  cpu: {
    averagePercent: number
    perCorePercent: number[]
    logicalCores: number
    physicalCores: number
    loadAverage: number[]
  }
  memory: { usedPercent: number; usedGb: number; totalGb: number; availableGb: number }
  disks: Array<{ mount: string; usedPercent: number; usedBytes: number; totalBytes: number }>
  runtime: {
    activeHandles: number
    pid: number
    uptimeSeconds: number
    rssMb: number
    heapUsedMb: number
    heapTotalMb: number
    nodeVersion: string
    v8Version: string
    platform: string
    osVersion: string
  }
  updatedAt: string
}

export async function getSystemStatus(token: string | null) {
  return readItem(await apiRequest<SystemStatus>('/api/v1/system/status', { token }))
}

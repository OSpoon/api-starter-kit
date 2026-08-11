import { execFile } from 'node:child_process'
import os from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

type CpuSample = { idle: number; total: number }
let previousCpuSample: CpuSample[] | null = null

function cpuSample() {
  return os.cpus().map((cpu) => {
    const times = cpu.times
    return {
      idle: times.idle,
      total: times.user + times.nice + times.sys + times.idle + times.irq,
    }
  })
}

function cpuUsage(current: CpuSample[], previous: CpuSample[] | null) {
  if (!previous || previous.length !== current.length) return current.map(() => 0)
  return current.map((sample, index) => {
    const prior = previous[index]
    const total = sample.total - prior.total
    return total > 0 ? Math.round((1 - (sample.idle - prior.idle) / total) * 100) : 0
  })
}

async function readMounts() {
  try {
    const { stdout } = await execFileAsync('df', ['-kP'], { timeout: 2_000 })
    return stdout
      .trim()
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length >= 6)
      .map((parts) => ({
        mount: parts.slice(5).join(' '),
        usedPercent: Number.parseInt(parts[4], 10) || 0,
        usedBytes: Number(parts[2]) * 1024,
        totalBytes: Number(parts[1]) * 1024,
      }))
      .filter((mount) => mount.totalBytes > 0)
  } catch {
    return []
  }
}

function bytesToGb(bytes: number) {
  return Math.round((bytes / 1024 ** 3) * 10) / 10
}

export async function readSystemStatus() {
  const current = cpuSample()
  const perCore = cpuUsage(current, previousCpuSample)
  previousCpuSample = current

  const mounts = await readMounts()
  const totalMemory = os.totalmem()
  const freeMemory = os.freemem()
  const memoryUsedPercent = Math.round(((totalMemory - freeMemory) / totalMemory) * 100)
  const processWithHandles = process as NodeJS.Process & { _getActiveHandles?: () => unknown[] }
  const processMemory = process.memoryUsage()

  return {
    cpu: {
      averagePercent: Math.round(perCore.reduce((sum, value) => sum + value, 0) / perCore.length),
      perCorePercent: perCore,
      logicalCores: os.cpus().length,
      physicalCores: os.cpus().length,
      loadAverage: os.loadavg().map((value) => Math.round(value * 100) / 100),
    },
    memory: {
      usedPercent: memoryUsedPercent,
      usedGb: bytesToGb(totalMemory - freeMemory),
      totalGb: bytesToGb(totalMemory),
      availableGb: bytesToGb(freeMemory),
    },
    disks: mounts,
    runtime: {
      activeHandles:
        typeof processWithHandles._getActiveHandles === 'function'
          ? processWithHandles._getActiveHandles().length
          : 0,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      rssMb: Math.round(processMemory.rss / 1024 ** 2),
      heapUsedMb: Math.round(processMemory.heapUsed / 1024 ** 2),
      heapTotalMb: Math.round(processMemory.heapTotal / 1024 ** 2),
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      platform: `${os.platform()} ${os.arch()}`,
      osVersion: os.version(),
    },
    updatedAt: new Date().toISOString(),
  }
}

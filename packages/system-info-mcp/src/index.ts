#!/usr/bin/env node

import { statfs } from 'node:fs/promises'
import os from 'node:os'

import { McpServer } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'

function toGiB(bytes: number) {
  return Math.round((bytes / 1024 ** 3) * 100) / 100
}

const server = new McpServer({ name: 'api-starter-system-info', version: '1.0.0' })
const noArguments = z.object({})
const readOnly = { readOnlyHint: true, idempotentHint: true, destructiveHint: false }

server.registerTool(
  'get_os_info',
  {
    title: 'Get operating system information',
    description:
      'Read the MCP host OS, hostname, architecture, OS version, and system uptime. This tool takes no arguments and makes no changes.',
    inputSchema: noArguments,
    annotations: readOnly,
  },
  async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            hostname: os.hostname(),
            type: os.type(),
            platform: os.platform(),
            release: os.release(),
            version: os.version(),
            architecture: os.arch(),
            uptimeSeconds: Math.floor(os.uptime()),
          },
          null,
          2
        ),
      },
    ],
  })
)

server.registerTool(
  'get_cpu_info',
  {
    title: 'Get CPU information',
    description:
      'Read the MCP host CPU model, logical core count, and system load averages. Load averages are unavailable on Windows. This tool takes no arguments and makes no changes.',
    inputSchema: noArguments,
    annotations: readOnly,
  },
  async () => {
    const cpus = os.cpus()
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              model: cpus[0]?.model ?? null,
              logicalCores: cpus.length,
              loadAverage: os.platform() === 'win32' ? null : os.loadavg(),
            },
            null,
            2
          ),
        },
      ],
    }
  }
)

server.registerTool(
  'get_memory_info',
  {
    title: 'Get memory information',
    description:
      'Read the MCP host physical memory totals, available and used memory, and usage percentage. This tool takes no arguments and makes no changes.',
    inputSchema: noArguments,
    annotations: readOnly,
  },
  async () => {
    const totalBytes = os.totalmem()
    const availableBytes = os.freemem()
    const usedBytes = totalBytes - availableBytes
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              totalBytes,
              availableBytes,
              usedBytes,
              usedPercent: totalBytes ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0,
              totalGiB: toGiB(totalBytes),
              availableGiB: toGiB(availableBytes),
            },
            null,
            2
          ),
        },
      ],
    }
  }
)

server.registerTool(
  'get_disk_info',
  {
    title: 'Get disk capacity',
    description:
      'Read total, available, and used capacity of the filesystem containing the MCP working directory. It does not enumerate other mounted disks. This tool takes no arguments and makes no changes.',
    inputSchema: noArguments,
    annotations: readOnly,
  },
  async () => {
    const path = process.cwd()
    try {
      const filesystem = await statfs(path)
      const totalBytes = filesystem.blocks * filesystem.bsize
      const availableBytes = filesystem.bavail * filesystem.bsize
      const usedBytes = totalBytes - availableBytes
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                path,
                totalBytes,
                availableBytes,
                usedBytes,
                usedPercent: totalBytes ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0,
                totalGiB: toGiB(totalBytes),
                availableGiB: toGiB(availableBytes),
              },
              null,
              2
            ),
          },
        ],
      }
    } catch {
      return {
        content: [{ type: 'text', text: JSON.stringify({ path, available: false }, null, 2) }],
      }
    }
  }
)

server.registerTool(
  'get_network_info',
  {
    title: 'Get network interfaces',
    description:
      'List local network interface names, IP addresses, netmasks, address families, and whether each interface is internal. Does not test internet connectivity or expose MAC addresses. This tool takes no arguments and makes no changes.',
    inputSchema: noArguments,
    annotations: readOnly,
  },
  async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            interfaces: Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) =>
              (addresses ?? []).map(({ address, netmask, family, cidr, internal }) => ({
                name,
                address,
                netmask,
                family,
                cidr,
                internal,
              }))
            ),
            internetConnectivityTested: false,
          },
          null,
          2
        ),
      },
    ],
  })
)

await server.connect(new StdioServerTransport())

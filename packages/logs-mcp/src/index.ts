#!/usr/bin/env node

import { stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

import { McpServer } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'

import { listLogServices, searchLogs } from './log_search.js'

function getLogDirectory(args: string[]) {
  if (args.length !== 2 || args[0] !== '--log-dir' || !args[1]) {
    throw new Error('Expected --log-dir followed by an absolute log directory')
  }
  if (!isAbsolute(args[1]) || args[1].includes('\0')) {
    throw new Error('The log directory must be an absolute path')
  }
  return resolve(args[1])
}

const logDirectory = getLogDirectory(process.argv.slice(2))
const logDirectoryStats = await stat(logDirectory)
if (!logDirectoryStats.isDirectory()) throw new Error('The configured log path is not a directory')

const server = new McpServer({ name: 'api-starter-logs', version: '1.0.0' })
const logFilters = {
  service: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .describe('Exact service name from list_log_services'),
  query: z.string().trim().max(256).optional().describe('Text to find in a log record'),
  requestId: z.string().trim().max(120).optional().describe('Request ID or trace ID'),
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
  sinceMinutes: z.number().int().min(1).max(10080).optional(),
}
const annotations = { readOnlyHint: true, idempotentHint: true, destructiveHint: false }

server.registerTool(
  'list_log_services',
  {
    title: 'List log services',
    description:
      'List the exact service names available under the configured log directory. Use one of these names with get_latest_log or search_logs when multiple services exist. This tool takes no arguments and makes no changes.',
    inputSchema: z.object({}),
    annotations,
  },
  async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify({ servicesAvailable: await listLogServices(logDirectory) }, null, 2),
      },
    ],
  })
)

server.registerTool(
  'get_latest_log',
  {
    title: 'Get latest matching log',
    description:
      'Return the newest matching log record for an optional exact service, text, request ID, level, or time range. If multiple services exist and service is omitted, the result asks you to choose from servicesAvailable. A null latest means no matching record. Timestamps include UTC and MCP-local forms. Results omit stack traces and bound long values.',
    inputSchema: z.object(logFilters),
    annotations,
  },
  async (input) => {
    const { items, ...summary } = await searchLogs(logDirectory, {
      ...input,
      offset: 0,
      limit: 1,
    })
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ...summary, latest: items[0] ?? null }, null, 2),
        },
      ],
    }
  }
)

server.registerTool(
  'search_logs',
  {
    title: 'Search application logs',
    description:
      'Search structured JSON logs for application services by text, request ID, level, and time range. Files may use the active service-name.log or rotated service-name.<rotation>.log pattern. If the configured directory contains multiple services, pass an exact available service name. A mismatched service returns available names; retry with one of them. Items are ordered newest first within that service; use items[0] for its latest matching log. A larger nextOffset reads older logs. timestamp remains UTC; prefer timestampLocal, formatted in the MCP process timezone, in user-facing answers. Results omit stack traces and bound long values.',
    inputSchema: z.object({
      ...logFilters,
      offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    annotations,
  },
  async (input) => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify(await searchLogs(logDirectory, input), null, 2),
      },
    ],
  })
)

await server.connect(new StdioServerTransport())

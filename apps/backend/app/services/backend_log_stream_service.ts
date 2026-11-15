import { type ChildProcess, spawn } from 'node:child_process'
import type { ServerResponse } from 'node:http'

import logger from '@adonisjs/core/services/logger'

import { backendLogStreamPath } from '#config/logger'

const initialLogLines = 200
const maxBufferedLines = 200
const maxResponseBufferBytes = 1_000_000
const keepaliveIntervalMs = 15_000
const subscribers = new Set<ServerResponse>()
const recentLines: string[] = []
let tailProcess: ChildProcess | undefined
let keepaliveTimer: ReturnType<typeof setInterval> | undefined
let restartTimer: ReturnType<typeof setTimeout> | undefined
let partialLine = ''

function writeEvent(response: ServerResponse, event: string, data: unknown) {
  if (response.destroyed || response.writableEnded) return
  if (response.writableLength > maxResponseBufferBytes) {
    response.end()
    return
  }

  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function publishLine(line: string) {
  if (!line) return

  recentLines.push(line)
  if (recentLines.length > maxBufferedLines) recentLines.shift()
  for (const response of subscribers) writeEvent(response, 'log', { line })
}

function startTail() {
  if (tailProcess || subscribers.size === 0) return

  const child = spawn('tail', ['-n', String(initialLogLines), '-F', backendLogStreamPath], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  tailProcess = child
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    const lines = (partialLine + chunk).split(/\r?\n/)
    partialLine = lines.pop() ?? ''
    for (const line of lines) publishLine(line)
  })
  child.once('error', (error) => {
    if (tailProcess !== child) return
    tailProcess = undefined
    logger.error({ err: error }, 'API log tail process failed')
    for (const response of subscribers) {
      writeEvent(response, 'error', { message: 'API log stream is unavailable' })
      response.end()
    }
  })
  child.once('close', () => {
    if (tailProcess !== child) return
    tailProcess = undefined
    if (subscribers.size > 0) {
      restartTimer = setTimeout(startTail, 1_000)
    } else {
      partialLine = ''
    }
  })
}

function stopTailWhenIdle() {
  if (subscribers.size > 0) return

  if (keepaliveTimer) clearInterval(keepaliveTimer)
  if (restartTimer) clearTimeout(restartTimer)
  keepaliveTimer = undefined
  restartTimer = undefined
  recentLines.length = 0
  partialLine = ''

  const child = tailProcess
  tailProcess = undefined
  child?.kill('SIGTERM')
}

export function subscribeToBackendLogs(response: ServerResponse) {
  const isFirstSubscriber = subscribers.size === 0
  subscribers.add(response)

  if (isFirstSubscriber) {
    recentLines.length = 0
    partialLine = ''
    startTail()
    keepaliveTimer = setInterval(() => {
      for (const stream of subscribers) {
        if (!stream.destroyed && !stream.writableEnded) stream.write(': keepalive\n\n')
      }
    }, keepaliveIntervalMs)
  } else {
    for (const line of recentLines) writeEvent(response, 'log', { line })
  }

  let closed = false
  const unsubscribe = () => {
    if (closed) return
    closed = true
    subscribers.delete(response)
    stopTailWhenIdle()
  }

  response.once('close', unsubscribe)
  response.once('error', unsubscribe)
  return unsubscribe
}

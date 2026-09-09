import OpenAI, { toFile } from 'openai'

import { readRuntimeLlmConfiguration } from '#services/llm_configuration_service'

export type LlmServiceName = 'chat' | 'asr' | 'embedding'

export type LlmConnectionTestResult = {
  ok: boolean
  failedServices: LlmServiceName[]
}

function createTestWav() {
  const sampleRate = 8_000
  const sampleCount = sampleRate / 2
  const dataSize = sampleCount * 2
  const wav = Buffer.alloc(44 + dataSize)

  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVE', 8)
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(dataSize, 40)

  return wav
}

function createClient(apiKey: string | null, baseURL: string | null, timeout: number) {
  return new OpenAI({
    apiKey: apiKey ?? 'no-key',
    baseURL: baseURL ?? undefined,
    timeout,
  })
}

async function testChatConnection(config: Awaited<ReturnType<typeof readRuntimeLlmConfiguration>>) {
  const client = createClient(config.chat.apiKey, config.chat.baseURL, config.requestTimeoutMs)
  await client.models.list()
}

async function testAsrConnection(config: Awaited<ReturnType<typeof readRuntimeLlmConfiguration>>) {
  if (!config.asr.baseURL || !config.asr.apiKey) {
    throw new Error('ASR configuration is incomplete')
  }

  const client = createClient(config.asr.apiKey, config.asr.baseURL, config.requestTimeoutMs)
  await client.audio.transcriptions.create({
    file: await toFile(createTestWav(), 'llm-connection-test.wav', { type: 'audio/wav' }),
    model: config.asr.model,
    response_format: 'json',
  })
}

async function testEmbeddingConnection(
  config: Awaited<ReturnType<typeof readRuntimeLlmConfiguration>>
) {
  if (!config.embedding.model) {
    throw new Error('Embedding model is not configured')
  }

  const client = createClient(
    config.embedding.apiKey,
    config.embedding.baseURL,
    config.requestTimeoutMs
  )
  const response = await client.embeddings.create({
    model: config.embedding.model,
    input: 'connection test',
  })
  if (!response.data.length) throw new Error('Embedding service returned no vector')
}

export async function testLlmConnections(): Promise<LlmConnectionTestResult> {
  const config = await readRuntimeLlmConfiguration()
  const tests: Array<[LlmServiceName, Promise<void>]> = [
    ['chat', testChatConnection(config)],
    ['asr', testAsrConnection(config)],
    ['embedding', testEmbeddingConnection(config)],
  ]
  const results = await Promise.allSettled(tests.map(([, promise]) => promise))
  const failedServices = results.flatMap((result, index) =>
    result.status === 'rejected' ? [tests[index]![0]] : []
  )

  return {
    ok: failedServices.length === 0,
    failedServices,
  }
}

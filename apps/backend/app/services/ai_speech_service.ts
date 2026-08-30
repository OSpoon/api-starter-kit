import { createReadStream } from 'node:fs'

import OpenAI, { toFile } from 'openai'

import { readRuntimeLlmConfiguration } from '#services/llm_configuration_service'

const DEFAULT_ASR_MODEL = 'Qwen3-ASR-0.6B-4bit'

const AUDIO_MIME_TYPES: Record<string, string> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
}

export function getAudioMimeType(fileName: string) {
  const extension = fileName.toLowerCase().split('.').pop() ?? ''
  return AUDIO_MIME_TYPES[extension] ?? 'application/octet-stream'
}

export async function transcribeAudio(filePath: string, fileName: string, mimeType: string) {
  const config = await readRuntimeLlmConfiguration()
  const baseURL = config.asr.baseURL?.trim()
  const apiKey = config.asr.apiKey?.trim()
  if (!baseURL || !apiKey) {
    throw new Error('语音转写服务未配置，请联系管理员在 LLM 配置页面配置 ASR 服务')
  }

  const client = new OpenAI({ baseURL, apiKey, timeout: 120_000 })
  const result = await client.audio.transcriptions.create({
    file: await toFile(createReadStream(filePath), fileName, { type: mimeType }),
    model: config.asr.model?.trim() || DEFAULT_ASR_MODEL,
    response_format: 'json',
  })
  const text = 'text' in result && typeof result.text === 'string' ? result.text.trim() : ''
  if (!text) throw new Error('ASR 服务未返回可用的转写文本')
  return text
}

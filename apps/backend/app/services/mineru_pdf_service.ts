import { setTimeout as delay } from 'node:timers/promises'

import { fromBufferPromise } from 'yauzl'
import { z } from 'zod'

const apiOrigin = 'https://mineru.net'
const uploadHost = 'mineru.oss-cn-shanghai.aliyuncs.com'
const resultHost = 'cdn-mineru.openxlab.org.cn'
const maxMarkdownBytes = 2 * 1024 * 1024
const maxArchiveBytes = 64 * 1024 * 1024

const batchResponse = z.object({
  code: z.literal(0),
  data: z.object({ batch_id: z.string().min(1).max(128), file_urls: z.tuple([z.string()]) }),
})
const resultResponse = z.object({
  code: z.literal(0),
  data: z.object({
    extract_result: z
      .array(
        z.object({
          data_id: z.string(),
          state: z.enum(['waiting-file', 'pending', 'running', 'converting', 'done', 'failed']),
          full_zip_url: z.string().optional(),
        })
      )
      .max(50),
  }),
})

function signedUrl(raw: string, host: string) {
  const url = new URL(raw)
  if (url.origin !== `https://${host}` || url.username || url.password) {
    throw new Error('文档解析服务返回了无效地址')
  }
  return url
}

async function mineruFetch(url: string | URL, options: RequestInit, signal: AbortSignal) {
  const response = await fetch(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error('文档解析服务请求失败')
  }
  return response
}

async function readLimited(stream: AsyncIterable<Uint8Array>, limit: number) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    size += chunk.byteLength
    if (size > limit) throw new Error('文档解析结果超过大小限制')
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function readMineruMarkdown(archive: Buffer) {
  const zip = await fromBufferPromise(archive, { lazyEntries: true, strictFileNames: true })
  try {
    if (zip.entryCount > 4096) throw new Error('文档解析结果文件过多')
    let markdown: string | undefined
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName.split('/').at(-1) !== 'full.md') continue
      if (markdown !== undefined || entry.uncompressedSize > maxMarkdownBytes) {
        throw new Error('文档解析结果中的 Markdown 无效')
      }
      markdown = await readLimited(await zip.openReadStreamPromise(entry), maxMarkdownBytes)
    }
    if (!markdown?.trim()) throw new Error('文档解析结果没有可用文本')
    return markdown.replaceAll('\0', '')
  } finally {
    zip.close()
  }
}

export async function submitMineruPdf(token: string, id: number, pdf: Buffer, signal: AbortSignal) {
  const response = await mineruFetch(
    `${apiOrigin}/api/v4/file-urls/batch`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{ name: 'attachment.pdf', data_id: String(id) }],
        model_version: 'vlm',
      }),
    },
    signal
  )
  const { data } = batchResponse.parse(JSON.parse(await readLimited(response.body!, 64 * 1024)))
  const uploaded = await mineruFetch(
    signedUrl(data.file_urls[0], uploadHost),
    {
      method: 'PUT',
      body: new Uint8Array(pdf),
    },
    signal
  )
  await uploaded.body?.cancel()
  return data.batch_id
}

export async function waitForMineruPdf(
  token: string,
  id: number,
  batchId: string,
  signal: AbortSignal
) {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const response = await mineruFetch(
      `${apiOrigin}/api/v4/extract-results/batch/${encodeURIComponent(batchId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
      signal
    )
    const { data } = resultResponse.parse(JSON.parse(await readLimited(response.body!, 64 * 1024)))
    const result = data.extract_result.find((entry) => entry.data_id === String(id))
    if (result?.state === 'failed') return { state: 'failed' } as const
    if (result?.state === 'done' && result.full_zip_url) {
      const download = await mineruFetch(signedUrl(result.full_zip_url, resultHost), {}, signal)
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of download.body!) {
        size += chunk.byteLength
        if (size > maxArchiveBytes) throw new Error('文档解析结果超过大小限制')
        chunks.push(Buffer.from(chunk))
      }
      return { state: 'ready', markdown: await readMineruMarkdown(Buffer.concat(chunks)) } as const
    }
    await delay(2_000, undefined, { signal })
  }
  return { state: 'pending' } as const
}

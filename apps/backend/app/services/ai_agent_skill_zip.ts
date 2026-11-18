import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'

import { openPromise } from 'yauzl'

export class AiAgentSkillZipError extends Error {
  status = 422
}

export async function extractAiAgentSkillZip(filePath: string, directory: string) {
  try {
    const zip = await openPromise(filePath, {
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    })
    try {
      const paths = new Set<string>()
      let bytes = 0
      let skillCount = 0
      if (zip.entryCount > 512) throw new Error('Too many ZIP entries')

      for await (const entry of zip.eachEntry()) {
        const isDirectory = entry.fileName.endsWith('/')
        const path = entry.fileName.replace(/\/$/, '')
        const segments = path.split('/')
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000
        if (
          path.length > 512 ||
          segments.some(
            (part) =>
              !part ||
              part === '.' ||
              part === '..' ||
              part.includes(':') ||
              [...part].some((character) => character.charCodeAt(0) < 32)
          ) ||
          (mode !== 0 && mode !== (isDirectory ? 0o040000 : 0o100000)) ||
          paths.has(path)
        ) {
          throw new Error('Invalid ZIP entry')
        }
        if (!isDirectory && segments.at(-1) === 'SKILL.md' && ++skillCount > 1) {
          throw new Error('ZIP contains multiple skills')
        }
        paths.add(path)
        bytes += entry.uncompressedSize
        if (bytes > 20 * 1024 * 1024) throw new Error('ZIP expands beyond the size limit')
        const destination = join(directory, path)
        if (isDirectory) {
          await mkdir(destination, { recursive: true })
        } else {
          await mkdir(dirname(destination), { recursive: true })
          await pipeline(
            await zip.openReadStreamPromise(entry),
            createWriteStream(destination, { flags: 'wx', mode: 0o600 })
          )
        }
      }
    } finally {
      zip.close()
    }
  } catch {
    throw new AiAgentSkillZipError('ZIP 无效，或包含不支持的路径、文件类型或超出大小限制')
  }
}

export type ServerUrlErrorCode = 'required' | 'invalid' | 'https_required' | 'origin_only'

export class ServerUrlError extends Error {
  readonly code: ServerUrlErrorCode

  constructor(code: ServerUrlErrorCode) {
    super(code)
    this.name = 'ServerUrlError'
    this.code = code
  }
}

function isLoopbackHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')

  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

export function normalizeServerOrigin(value: string) {
  const input = value.trim()

  if (!input) {
    throw new ServerUrlError('required')
  }

  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new ServerUrlError('invalid')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ServerUrlError('invalid')
  }

  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new ServerUrlError('origin_only')
  }

  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    throw new ServerUrlError('https_required')
  }

  return url.origin
}

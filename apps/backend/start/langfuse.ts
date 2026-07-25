import { LangfuseSpanProcessor } from '@langfuse/otel'
import { NodeSDK } from '@opentelemetry/sdk-node'

let processor: LangfuseSpanProcessor | null = null

const enabled =
  process.env.LANGFUSE_ENABLED === 'true' &&
  Boolean(process.env.LANGFUSE_PUBLIC_KEY) &&
  Boolean(process.env.LANGFUSE_SECRET_KEY)

if (enabled) {
  processor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    environment: process.env.NODE_ENV,
    mediaUploadEnabled: false,
    mask: ({ data }) =>
      typeof data === 'string'
        ? data.replace(/\b(?:sk|pk|rk)_[A-Za-z0-9_-]+\b|\bBearer\s+[A-Za-z0-9._-]+/gi, '[REDACTED]')
        : data,
  })
  const sdk = new NodeSDK({
    spanProcessors: [processor],
  })
  sdk.start()
}

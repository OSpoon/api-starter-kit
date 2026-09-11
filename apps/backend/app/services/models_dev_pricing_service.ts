import type { ModelCost } from '@earendil-works/pi-ai'

const MODELS_DEV_API_URL = 'https://models.dev/api.json'
const CATALOG_CACHE_TTL_MS = 60 * 60 * 1000
const CATALOG_REQUEST_TIMEOUT_MS = 5_000

type ModelsDevCost = {
  input?: unknown
  output?: unknown
  cache_read?: unknown
  cache_write?: unknown
}

type ModelsDevModel = {
  id?: unknown
  cost?: ModelsDevCost
  last_updated?: unknown
}

type ModelsDevProvider = {
  api?: unknown
  models?: Record<string, ModelsDevModel>
}

export type ModelsDevPricing = {
  modelId: string
  cost: ModelCost
  version: string | null
}

let catalogPromise: Promise<Record<string, ModelsDevProvider> | null> | null = null
let catalogLoadedAt = 0

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function normalizeModelId(value: string) {
  return value.trim().toLowerCase()
}

function normalizeEndpoint(value: string) {
  return value.trim().replace(/\/+$/, '').toLowerCase()
}

function providerMatchesBaseUrl(provider: ModelsDevProvider, baseUrl: string) {
  if (typeof provider.api !== 'string' || !provider.api.trim()) return false
  const configured = normalizeEndpoint(baseUrl)
  const catalog = normalizeEndpoint(provider.api)
  return (
    configured === catalog ||
    configured.startsWith(`${catalog}/`) ||
    catalog.startsWith(`${configured}/`)
  )
}

function toModelPricing(modelId: string, model: ModelsDevModel): ModelsDevPricing | null {
  const input = finiteNumber(model.cost?.input)
  const output = finiteNumber(model.cost?.output)
  if (input === null || output === null) return null

  return {
    modelId,
    cost: {
      input,
      output,
      cacheRead: finiteNumber(model.cost?.cache_read) ?? 0,
      cacheWrite: finiteNumber(model.cost?.cache_write) ?? 0,
    },
    version: typeof model.last_updated === 'string' ? model.last_updated : null,
  }
}

export function findModelsDevPricing(
  catalog: Record<string, ModelsDevProvider>,
  requestedModelId: string,
  baseUrl?: string
) {
  const requested = normalizeModelId(requestedModelId)
  if (!requested) return null

  const exactMatches: ModelsDevPricing[] = []
  const shortMatches: ModelsDevPricing[] = []

  const providers = Object.values(catalog)
  const scopedProviders = baseUrl
    ? providers.filter((provider) => providerMatchesBaseUrl(provider, baseUrl))
    : providers

  // A custom endpoint must never inherit a public provider's price merely
  // because it uses the same model name.
  if (baseUrl && scopedProviders.length === 0) return null

  for (const provider of scopedProviders) {
    for (const [key, model] of Object.entries(provider.models ?? {})) {
      const modelId = typeof model.id === 'string' ? model.id : key
      const pricing = toModelPricing(modelId, model)
      if (!pricing) continue
      const normalizedModelId = normalizeModelId(modelId)
      if (normalizedModelId === requested) {
        exactMatches.push(pricing)
      } else if (normalizedModelId.split('/').at(-1) === requested) {
        shortMatches.push(pricing)
      }
    }
  }

  if (exactMatches.length === 1) return exactMatches[0]

  // A short model name is safe only when models.dev has one unambiguous
  // priced match. Provider-specific prices must not be guessed.
  const candidates = exactMatches.length > 1 ? exactMatches : shortMatches
  if (candidates.length !== 1) return null
  return candidates[0]
}

async function fetchModelsDevCatalog() {
  const response = await fetch(MODELS_DEV_API_URL, {
    signal: AbortSignal.timeout(CATALOG_REQUEST_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`)

  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('models.dev returned an invalid catalog')
  }

  return payload as Record<string, ModelsDevProvider>
}

async function loadCatalog() {
  const now = Date.now()
  if (catalogPromise && now - catalogLoadedAt < CATALOG_CACHE_TTL_MS) {
    return catalogPromise
  }

  catalogLoadedAt = now
  catalogPromise = fetchModelsDevCatalog().catch(() => null)
  return catalogPromise
}

export async function resolveModelsDevPricing(modelId: string, baseUrl?: string) {
  const catalog = await loadCatalog()
  return catalog ? findModelsDevPricing(catalog, modelId, baseUrl) : null
}

export function calculateModelsDevCost(
  usage: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  },
  cost: ModelCost
) {
  return (
    (usage.input * cost.input +
      usage.output * cost.output +
      usage.cacheRead * cost.cacheRead +
      usage.cacheWrite * cost.cacheWrite) /
    1_000_000
  )
}

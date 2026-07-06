export interface ApiEnvelope<T> {
  data: T
}

export type ApiListPayload<T> = T[] | ApiEnvelope<T[]> | ApiEnvelope<ApiEnvelope<T[]>>

export type ApiItemPayload<T> = T | ApiEnvelope<T>

export function readList<T>(payload: ApiListPayload<T>) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload.data)) {
    return payload.data
  }

  if ('data' in payload.data && Array.isArray(payload.data.data)) {
    return payload.data.data
  }

  return []
}

export function readItem<T>(payload: ApiItemPayload<T>) {
  if (!payload || typeof payload !== 'object') {
    return payload as T
  }

  if ('data' in payload) {
    const data = payload.data
    if (data && typeof data === 'object' && 'data' in data && !Array.isArray(data)) {
      return data.data as T
    }
    return data as T
  }

  return payload as T
}

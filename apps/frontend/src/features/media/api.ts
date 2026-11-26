import { apiRequest, apiUrl } from '@/lib/api'
import { readItem } from '@/lib/api-types'

interface MediaImageUpload {
  url: string
}

export async function uploadMediaImage(token: string | null, file: File) {
  const body = new FormData()
  body.append('image', file)
  const response = await apiRequest<MediaImageUpload>('/api/v1/media/images', {
    token,
    method: 'POST',
    body,
  })
  const image = readItem(response)

  return { ...image, url: apiUrl(image.url) }
}

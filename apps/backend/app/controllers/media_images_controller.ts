import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import {
  getAiChatImageValidationMessage,
  validateAiChatImage,
} from '#services/ai_chat_image_service'
import { mediaImageFileNameValidator, uploadMediaImageValidator } from '#validators/media_image'

const extensionByMimeType = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

const mimeTypeByExtension = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const

function getImageDirectory() {
  return app.makePath('storage', 'media', 'images')
}

export default class MediaImagesController {
  @ApiSecurity('bearerAuth')
  @ApiOperation({ summary: '上传图片到本地媒体存储' })
  @ApiBody({
    mediaType: 'multipart/form-data',
    required: true,
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 200, description: '返回已上传图片的读取地址' })
  @ApiResponse({ status: 401, description: '未登录' })
  @ApiResponse({ status: 403, description: '缺少图片上传权限' })
  @ApiResponse({ status: 422, description: '图片无效或超过 2 MB' })
  async upload({ request, response, serialize }: HttpContext) {
    const { image } = await request.validateUsing(uploadMediaImageValidator)
    if (!image.tmpPath) {
      return response.unprocessableEntity({ message: '请上传有效图片' })
    }

    const data = await readFile(image.tmpPath)
    let mimeType: ReturnType<typeof validateAiChatImage>
    try {
      mimeType = validateAiChatImage(data)
    } catch (error) {
      const message = getAiChatImageValidationMessage(error)
      if (message) return response.unprocessableEntity({ message })
      throw error
    }

    const fileName = `${randomUUID()}.${extensionByMimeType[mimeType]}`
    await mkdir(getImageDirectory(), { recursive: true, mode: 0o700 })
    // shortcut: images have no quota or cleanup; add managed records when they need lifecycle controls.
    await writeFile(join(getImageDirectory(), fileName), data, { flag: 'wx', mode: 0o600 })

    return serialize({ url: `/api/v1/media/images/${fileName}` })
  }

  @ApiOperation({ summary: '读取已上传的媒体图片' })
  @ApiResponse({ status: 200, description: '返回图片二进制数据' })
  @ApiResponse({ status: 404, description: '图片不存在' })
  async show({ request, response }: HttpContext) {
    const { fileName } = await mediaImageFileNameValidator.validate({
      fileName: request.param('fileName'),
    })
    const extension = fileName.split('.').at(-1) as keyof typeof mimeTypeByExtension

    try {
      const data = await readFile(join(getImageDirectory(), fileName))
      response.header('Content-Type', mimeTypeByExtension[extension])
      response.header('Content-Disposition', 'inline')
      response.header('Cache-Control', 'public, max-age=31536000, immutable')
      response.header('X-Content-Type-Options', 'nosniff')
      return response.send(data)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return response.notFound({ message: '图片不存在' })
      }
      throw error
    }
  }
}

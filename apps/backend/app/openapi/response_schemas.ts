import type { ApiResponse } from '@foadonis/openapi/decorators'

export type ApiSchema = NonNullable<Parameters<typeof ApiResponse>[0]['schema']>

export const paginationMetaSchema: ApiSchema = {
  type: 'object',
  required: ['total', 'perPage', 'currentPage', 'lastPage'],
  properties: {
    total: { type: 'integer' },
    perPage: { type: 'integer' },
    currentPage: { type: 'integer' },
    lastPage: { type: 'integer' },
    firstPage: { type: 'integer' },
    firstPageUrl: { type: 'string', nullable: true },
    lastPageUrl: { type: 'string', nullable: true },
    nextPageUrl: { type: 'string', nullable: true },
    previousPageUrl: { type: 'string', nullable: true },
  },
}

export function dataEnvelope(data: ApiSchema): ApiSchema {
  return {
    type: 'object',
    required: ['data'],
    properties: { data },
  }
}

export const authenticatedUserSchema: ApiSchema = {
  type: 'object',
  required: [
    'id',
    'fullName',
    'email',
    'createdAt',
    'updatedAt',
    'initials',
    'twoFactorEnabled',
    'passwordChangedAt',
    'roles',
    'permissions',
  ],
  properties: {
    id: { type: 'integer' },
    fullName: { type: 'string' },
    email: { type: 'string', format: 'email' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    initials: { type: 'string' },
    twoFactorEnabled: { type: 'boolean' },
    passwordChangedAt: { type: 'string', nullable: true, format: 'date-time' },
    roles: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'code', 'name'],
        properties: {
          id: { type: 'integer' },
          code: { type: 'string' },
          name: { type: 'string' },
        },
      },
    },
    permissions: { type: 'array', items: { type: 'string' } },
    githubLinked: { type: 'boolean' },
    channelIdentities: {
      type: 'array',
      items: {
        type: 'object',
        required: ['channel', 'boundAt'],
        properties: {
          channel: { type: 'string' },
          boundAt: { type: 'string', nullable: true, format: 'date-time' },
        },
      },
    },
  },
}

export function paginatedDataEnvelope(item: ApiSchema): ApiSchema {
  return dataEnvelope({
    type: 'object',
    required: ['items', 'meta'],
    properties: {
      items: { type: 'array', items: item },
      meta: paginationMetaSchema,
    },
  })
}

export const errorResponseSchema: ApiSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    code: { type: 'string' },
    status: { type: 'integer' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          field: { type: 'string' },
          rule: { type: 'string' },
        },
        additionalProperties: true,
      },
    },
  },
  additionalProperties: true,
}

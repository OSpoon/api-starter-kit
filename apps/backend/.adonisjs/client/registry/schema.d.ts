/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'wecom.messages.send': {
    methods: ["POST"]
    pattern: '/api/v1/wecom-messages/:id/send'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/wecom_message_template').wecomTemplateParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/wecom_message_template').wecomTemplateParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['send']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['send']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'openapi.html': {
    methods: ["GET","HEAD"]
    pattern: '/api-docs'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'openapi.json': {
    methods: ["GET","HEAD"]
    pattern: '/api-docs.json'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'openapi.yaml': {
    methods: ["GET","HEAD"]
    pattern: '/api-docs.yaml'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'auth.signup': {
    methods: ["POST"]
    pattern: '/api/v1/auth/signup'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>>
    }
  }
  'auth.login': {
    methods: ["POST"]
    pattern: '/api/v1/auth/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').loginValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').loginValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.github.redirect': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/auth/github'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/github_oauth_controller').default['redirect']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/github_oauth_controller').default['redirect']>>>
    }
  }
  'auth.github.callback': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/auth/github/callback'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/github_oauth_controller').default['callback']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/github_oauth_controller').default['callback']>>>
    }
  }
  'auth.github.exchange': {
    methods: ["POST"]
    pattern: '/api/v1/auth/github/exchange'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/github_oauth_controller').default['exchange']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/github_oauth_controller').default['exchange']>>>
    }
  }
  'auth.2fa.verify': {
    methods: ["POST"]
    pattern: '/api/v1/auth/2fa/verify'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').verifyTwoFactorValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').verifyTwoFactorValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/two_factor_auth_controller').default['verify']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/two_factor_auth_controller').default['verify']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'profile.profile.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/account/profile'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['show']>>>
    }
  }
  'profile.profile.change_password': {
    methods: ["PUT"]
    pattern: '/api/v1/account/password'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').changePasswordValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').changePasswordValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['changePassword']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['changePassword']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'profile.2fa.generate': {
    methods: ["POST"]
    pattern: '/api/v1/account/2fa/generate'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/two_factor_auth_controller').default['generate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/two_factor_auth_controller').default['generate']>>>
    }
  }
  'profile.2fa.enable': {
    methods: ["POST"]
    pattern: '/api/v1/account/2fa/enable'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').enableTwoFactorValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').enableTwoFactorValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/two_factor_auth_controller').default['enable']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/two_factor_auth_controller').default['enable']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'profile.profile.disable_two_factor': {
    methods: ["POST"]
    pattern: '/api/v1/account/2fa/disable'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').twoFactorValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').twoFactorValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['disableTwoFactor']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['disableTwoFactor']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'profile.access_tokens.destroy': {
    methods: ["POST"]
    pattern: '/api/v1/account/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['destroy']>>>
    }
  }
  'api_keys.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/api-keys'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['index']>>>
    }
  }
  'api_keys.store': {
    methods: ["POST"]
    pattern: '/api/v1/api-keys'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/api_key').apiKeyValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/api_key').apiKeyValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'api_keys.update': {
    methods: ["PUT"]
    pattern: '/api/v1/api-keys/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/api_key').apiKeyValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/api_key').apiKeyValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'api_keys.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/api-keys/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api_keys_controller').default['destroy']>>>
    }
  }
  'wecom_message_templates.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/system/wecom-message-templates'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['index']>>>
    }
  }
  'wecom_message_templates.store': {
    methods: ["POST"]
    pattern: '/api/v1/system/wecom-message-templates'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/wecom_message_template').createWecomMessageTemplateValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/wecom_message_template').createWecomMessageTemplateValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'wecom_message_templates.update': {
    methods: ["PUT"]
    pattern: '/api/v1/system/wecom-message-templates/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/wecom_message_template').updateWecomMessageTemplateValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/wecom_message_template').updateWecomMessageTemplateValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'wecom_message_templates.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/system/wecom-message-templates/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['destroy']>>>
    }
  }
  'wecom_message_templates.test_draft': {
    methods: ["POST"]
    pattern: '/api/v1/system/wecom-message-templates/test'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/wecom_message_template').wecomTemplateDraftTestValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/wecom_message_template').wecomTemplateDraftTestValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['testDraft']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['testDraft']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'wecom_message_templates.test_send': {
    methods: ["POST"]
    pattern: '/api/v1/system/wecom-message-templates/:id/test'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/wecom_message_template').wecomTemplateParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/wecom_message_template').wecomTemplateParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['testSend']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['testSend']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'system.wecom.messages.send': {
    methods: ["POST"]
    pattern: '/api/v1/system/wecom-messages/:id/send'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/wecom_message_template').wecomTemplateParamsValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/wecom_message_template').wecomTemplateParamsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['send']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['send']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'wecom_message_templates.upload_media': {
    methods: ["POST"]
    pattern: '/api/v1/system/wecom-message-templates/:id/media'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['uploadMedia']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/wecom_message_templates_controller').default['uploadMedia']>>>
    }
  }
  'knowledge_documents.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/system/knowledge-documents'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['index']>>>
    }
  }
  'knowledge_documents.store': {
    methods: ["POST"]
    pattern: '/api/v1/system/knowledge-documents'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['store']>>>
    }
  }
  'knowledge_documents.update': {
    methods: ["PUT"]
    pattern: '/api/v1/system/knowledge-documents/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['update']>>>
    }
  }
  'knowledge_documents.reindex': {
    methods: ["POST"]
    pattern: '/api/v1/system/knowledge-documents/:id/reindex'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['reindex']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['reindex']>>>
    }
  }
  'knowledge_documents.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/system/knowledge-documents/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/knowledge_documents_controller').default['destroy']>>>
    }
  }
  'users.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/system/users'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/users_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/users_controller').default['index']>>>
    }
  }
  'users.store': {
    methods: ["POST"]
    pattern: '/api/v1/system/users'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/rbac').createManagedUserValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/rbac').createManagedUserValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/users_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/users_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'users.update': {
    methods: ["PUT"]
    pattern: '/api/v1/system/users/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/rbac').updateManagedUserValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/rbac').updateManagedUserValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/users_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/users_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'users.reset_password': {
    methods: ["POST"]
    pattern: '/api/v1/system/users/:id/reset-password'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/users_controller').default['resetPassword']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/users_controller').default['resetPassword']>>>
    }
  }
  'users.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/system/users/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/users_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/users_controller').default['destroy']>>>
    }
  }
  'roles.catalog': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/system/roles/catalog'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['catalog']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['catalog']>>>
    }
  }
  'roles.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/system/roles'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['index']>>>
    }
  }
  'roles.store': {
    methods: ["POST"]
    pattern: '/api/v1/system/roles'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/rbac').createRoleValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/rbac').createRoleValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'roles.update': {
    methods: ["PUT"]
    pattern: '/api/v1/system/roles/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/rbac').updateRoleValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/rbac').updateRoleValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'roles.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/system/roles/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/roles_controller').default['destroy']>>>
    }
  }
  'permissions.catalog': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/system/permissions/catalog'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/permissions_controller').default['catalog']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/permissions_controller').default['catalog']>>>
    }
  }
  'permissions.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/system/permissions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/permissions_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/permissions_controller').default['index']>>>
    }
  }
  'permissions.store': {
    methods: ["POST"]
    pattern: '/api/v1/system/permissions'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/rbac').createPermissionValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/rbac').createPermissionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/permissions_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/permissions_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'permissions.update': {
    methods: ["PUT"]
    pattern: '/api/v1/system/permissions/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/rbac').updatePermissionValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/rbac').updatePermissionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/permissions_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/permissions_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'permissions.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/system/permissions/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/permissions_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/permissions_controller').default['destroy']>>>
    }
  }
  'audit_logs.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/system/audit-logs'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/audit_logs_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/audit_logs_controller').default['index']>>>
    }
  }
  'ai_chat.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/ai-chat/conversations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/ai_chat_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/ai_chat_controller').default['index']>>>
    }
  }
  'ai_chat.store': {
    methods: ["POST"]
    pattern: '/api/v1/ai-chat/conversations'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/ai_chat').createConversationValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/ai_chat').createConversationValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/ai_chat_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/ai_chat_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'ai_chat.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/ai-chat/conversations/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/ai_chat_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/ai_chat_controller').default['show']>>>
    }
  }
  'ai_chat.send_message': {
    methods: ["POST"]
    pattern: '/api/v1/ai-chat/conversations/:id/messages'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/ai_chat').sendAiChatMessageValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/ai_chat').sendAiChatMessageValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/ai_chat_controller').default['sendMessage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/ai_chat_controller').default['sendMessage']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'ai_chat.resume': {
    methods: ["POST"]
    pattern: '/api/v1/ai-chat/conversations/:id/resume'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/ai_chat').resumeAiChatValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/ai_chat').resumeAiChatValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/ai_chat_controller').default['resume']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/ai_chat_controller').default['resume']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'ai_chat.confirm_ai_agent_action': {
    methods: ["POST"]
    pattern: '/api/v1/ai-chat/conversations/:id/confirmations/:confirmationId/confirm'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; confirmationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/ai_chat_controller').default['confirmAiAgentAction']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/ai_chat_controller').default['confirmAiAgentAction']>>>
    }
  }
  'ai_chat.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/ai-chat/conversations/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/ai_chat_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/ai_chat_controller').default['destroy']>>>
    }
  }
}

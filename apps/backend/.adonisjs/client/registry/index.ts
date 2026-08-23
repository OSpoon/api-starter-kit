/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'wecom.messages.send': {
    methods: ["POST"],
    pattern: '/api/v1/wecom-messages/:id/send',
    tokens: [{"old":"/api/v1/wecom-messages/:id/send","type":0,"val":"api","end":""},{"old":"/api/v1/wecom-messages/:id/send","type":0,"val":"v1","end":""},{"old":"/api/v1/wecom-messages/:id/send","type":0,"val":"wecom-messages","end":""},{"old":"/api/v1/wecom-messages/:id/send","type":1,"val":"id","end":""},{"old":"/api/v1/wecom-messages/:id/send","type":0,"val":"send","end":""}],
    types: placeholder as Registry['wecom.messages.send']['types'],
  },
  'openapi.html': {
    methods: ["GET","HEAD"],
    pattern: '/api-docs',
    tokens: [{"old":"/api-docs","type":0,"val":"api-docs","end":""}],
    types: placeholder as Registry['openapi.html']['types'],
  },
  'openapi.json': {
    methods: ["GET","HEAD"],
    pattern: '/api-docs.json',
    tokens: [{"old":"/api-docs.json","type":0,"val":"api-docs.json","end":""}],
    types: placeholder as Registry['openapi.json']['types'],
  },
  'openapi.yaml': {
    methods: ["GET","HEAD"],
    pattern: '/api-docs.yaml',
    tokens: [{"old":"/api-docs.yaml","type":0,"val":"api-docs.yaml","end":""}],
    types: placeholder as Registry['openapi.yaml']['types'],
  },
  'auth.signup': {
    methods: ["POST"],
    pattern: '/api/v1/auth/signup',
    tokens: [{"old":"/api/v1/auth/signup","type":0,"val":"api","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['auth.signup']['types'],
  },
  'auth.login': {
    methods: ["POST"],
    pattern: '/api/v1/auth/login',
    tokens: [{"old":"/api/v1/auth/login","type":0,"val":"api","end":""},{"old":"/api/v1/auth/login","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/login","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['auth.login']['types'],
  },
  'auth.github.redirect': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/auth/github',
    tokens: [{"old":"/api/v1/auth/github","type":0,"val":"api","end":""},{"old":"/api/v1/auth/github","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/github","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/github","type":0,"val":"github","end":""}],
    types: placeholder as Registry['auth.github.redirect']['types'],
  },
  'auth.github.callback': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/auth/github/callback',
    tokens: [{"old":"/api/v1/auth/github/callback","type":0,"val":"api","end":""},{"old":"/api/v1/auth/github/callback","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/github/callback","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/github/callback","type":0,"val":"github","end":""},{"old":"/api/v1/auth/github/callback","type":0,"val":"callback","end":""}],
    types: placeholder as Registry['auth.github.callback']['types'],
  },
  'auth.github.exchange': {
    methods: ["POST"],
    pattern: '/api/v1/auth/github/exchange',
    tokens: [{"old":"/api/v1/auth/github/exchange","type":0,"val":"api","end":""},{"old":"/api/v1/auth/github/exchange","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/github/exchange","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/github/exchange","type":0,"val":"github","end":""},{"old":"/api/v1/auth/github/exchange","type":0,"val":"exchange","end":""}],
    types: placeholder as Registry['auth.github.exchange']['types'],
  },
  'auth.github.complete': {
    methods: ["POST"],
    pattern: '/api/v1/auth/github/complete',
    tokens: [{"old":"/api/v1/auth/github/complete","type":0,"val":"api","end":""},{"old":"/api/v1/auth/github/complete","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/github/complete","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/github/complete","type":0,"val":"github","end":""},{"old":"/api/v1/auth/github/complete","type":0,"val":"complete","end":""}],
    types: placeholder as Registry['auth.github.complete']['types'],
  },
  'auth.2fa.verify': {
    methods: ["POST"],
    pattern: '/api/v1/auth/2fa/verify',
    tokens: [{"old":"/api/v1/auth/2fa/verify","type":0,"val":"api","end":""},{"old":"/api/v1/auth/2fa/verify","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/2fa/verify","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/2fa/verify","type":0,"val":"2fa","end":""},{"old":"/api/v1/auth/2fa/verify","type":0,"val":"verify","end":""}],
    types: placeholder as Registry['auth.2fa.verify']['types'],
  },
  'profile.profile.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/account/profile',
    tokens: [{"old":"/api/v1/account/profile","type":0,"val":"api","end":""},{"old":"/api/v1/account/profile","type":0,"val":"v1","end":""},{"old":"/api/v1/account/profile","type":0,"val":"account","end":""},{"old":"/api/v1/account/profile","type":0,"val":"profile","end":""}],
    types: placeholder as Registry['profile.profile.show']['types'],
  },
  'profile.profile.change_password': {
    methods: ["PUT"],
    pattern: '/api/v1/account/password',
    tokens: [{"old":"/api/v1/account/password","type":0,"val":"api","end":""},{"old":"/api/v1/account/password","type":0,"val":"v1","end":""},{"old":"/api/v1/account/password","type":0,"val":"account","end":""},{"old":"/api/v1/account/password","type":0,"val":"password","end":""}],
    types: placeholder as Registry['profile.profile.change_password']['types'],
  },
  'profile.github.unlink': {
    methods: ["POST"],
    pattern: '/api/v1/account/github/unlink',
    tokens: [{"old":"/api/v1/account/github/unlink","type":0,"val":"api","end":""},{"old":"/api/v1/account/github/unlink","type":0,"val":"v1","end":""},{"old":"/api/v1/account/github/unlink","type":0,"val":"account","end":""},{"old":"/api/v1/account/github/unlink","type":0,"val":"github","end":""},{"old":"/api/v1/account/github/unlink","type":0,"val":"unlink","end":""}],
    types: placeholder as Registry['profile.github.unlink']['types'],
  },
  'profile.2fa.generate': {
    methods: ["POST"],
    pattern: '/api/v1/account/2fa/generate',
    tokens: [{"old":"/api/v1/account/2fa/generate","type":0,"val":"api","end":""},{"old":"/api/v1/account/2fa/generate","type":0,"val":"v1","end":""},{"old":"/api/v1/account/2fa/generate","type":0,"val":"account","end":""},{"old":"/api/v1/account/2fa/generate","type":0,"val":"2fa","end":""},{"old":"/api/v1/account/2fa/generate","type":0,"val":"generate","end":""}],
    types: placeholder as Registry['profile.2fa.generate']['types'],
  },
  'profile.2fa.enable': {
    methods: ["POST"],
    pattern: '/api/v1/account/2fa/enable',
    tokens: [{"old":"/api/v1/account/2fa/enable","type":0,"val":"api","end":""},{"old":"/api/v1/account/2fa/enable","type":0,"val":"v1","end":""},{"old":"/api/v1/account/2fa/enable","type":0,"val":"account","end":""},{"old":"/api/v1/account/2fa/enable","type":0,"val":"2fa","end":""},{"old":"/api/v1/account/2fa/enable","type":0,"val":"enable","end":""}],
    types: placeholder as Registry['profile.2fa.enable']['types'],
  },
  'profile.profile.disable_two_factor': {
    methods: ["POST"],
    pattern: '/api/v1/account/2fa/disable',
    tokens: [{"old":"/api/v1/account/2fa/disable","type":0,"val":"api","end":""},{"old":"/api/v1/account/2fa/disable","type":0,"val":"v1","end":""},{"old":"/api/v1/account/2fa/disable","type":0,"val":"account","end":""},{"old":"/api/v1/account/2fa/disable","type":0,"val":"2fa","end":""},{"old":"/api/v1/account/2fa/disable","type":0,"val":"disable","end":""}],
    types: placeholder as Registry['profile.profile.disable_two_factor']['types'],
  },
  'profile.channel_identities.bind': {
    methods: ["POST"],
    pattern: '/api/v1/account/channel-identities/bind',
    tokens: [{"old":"/api/v1/account/channel-identities/bind","type":0,"val":"api","end":""},{"old":"/api/v1/account/channel-identities/bind","type":0,"val":"v1","end":""},{"old":"/api/v1/account/channel-identities/bind","type":0,"val":"account","end":""},{"old":"/api/v1/account/channel-identities/bind","type":0,"val":"channel-identities","end":""},{"old":"/api/v1/account/channel-identities/bind","type":0,"val":"bind","end":""}],
    types: placeholder as Registry['profile.channel_identities.bind']['types'],
  },
  'profile.channel_identities.unbind_wecom': {
    methods: ["POST"],
    pattern: '/api/v1/account/channel-identities/wecom/unbind',
    tokens: [{"old":"/api/v1/account/channel-identities/wecom/unbind","type":0,"val":"api","end":""},{"old":"/api/v1/account/channel-identities/wecom/unbind","type":0,"val":"v1","end":""},{"old":"/api/v1/account/channel-identities/wecom/unbind","type":0,"val":"account","end":""},{"old":"/api/v1/account/channel-identities/wecom/unbind","type":0,"val":"channel-identities","end":""},{"old":"/api/v1/account/channel-identities/wecom/unbind","type":0,"val":"wecom","end":""},{"old":"/api/v1/account/channel-identities/wecom/unbind","type":0,"val":"unbind","end":""}],
    types: placeholder as Registry['profile.channel_identities.unbind_wecom']['types'],
  },
  'profile.channel_identities.unbind_feishu': {
    methods: ["POST"],
    pattern: '/api/v1/account/channel-identities/feishu/unbind',
    tokens: [{"old":"/api/v1/account/channel-identities/feishu/unbind","type":0,"val":"api","end":""},{"old":"/api/v1/account/channel-identities/feishu/unbind","type":0,"val":"v1","end":""},{"old":"/api/v1/account/channel-identities/feishu/unbind","type":0,"val":"account","end":""},{"old":"/api/v1/account/channel-identities/feishu/unbind","type":0,"val":"channel-identities","end":""},{"old":"/api/v1/account/channel-identities/feishu/unbind","type":0,"val":"feishu","end":""},{"old":"/api/v1/account/channel-identities/feishu/unbind","type":0,"val":"unbind","end":""}],
    types: placeholder as Registry['profile.channel_identities.unbind_feishu']['types'],
  },
  'profile.channel_identities.unbind_dingtalk': {
    methods: ["POST"],
    pattern: '/api/v1/account/channel-identities/dingtalk/unbind',
    tokens: [{"old":"/api/v1/account/channel-identities/dingtalk/unbind","type":0,"val":"api","end":""},{"old":"/api/v1/account/channel-identities/dingtalk/unbind","type":0,"val":"v1","end":""},{"old":"/api/v1/account/channel-identities/dingtalk/unbind","type":0,"val":"account","end":""},{"old":"/api/v1/account/channel-identities/dingtalk/unbind","type":0,"val":"channel-identities","end":""},{"old":"/api/v1/account/channel-identities/dingtalk/unbind","type":0,"val":"dingtalk","end":""},{"old":"/api/v1/account/channel-identities/dingtalk/unbind","type":0,"val":"unbind","end":""}],
    types: placeholder as Registry['profile.channel_identities.unbind_dingtalk']['types'],
  },
  'profile.access_tokens.destroy': {
    methods: ["POST"],
    pattern: '/api/v1/account/logout',
    tokens: [{"old":"/api/v1/account/logout","type":0,"val":"api","end":""},{"old":"/api/v1/account/logout","type":0,"val":"v1","end":""},{"old":"/api/v1/account/logout","type":0,"val":"account","end":""},{"old":"/api/v1/account/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['profile.access_tokens.destroy']['types'],
  },
  'profile.github.link': {
    methods: ["POST"],
    pattern: '/api/v1/account/github/link',
    tokens: [{"old":"/api/v1/account/github/link","type":0,"val":"api","end":""},{"old":"/api/v1/account/github/link","type":0,"val":"v1","end":""},{"old":"/api/v1/account/github/link","type":0,"val":"account","end":""},{"old":"/api/v1/account/github/link","type":0,"val":"github","end":""},{"old":"/api/v1/account/github/link","type":0,"val":"link","end":""}],
    types: placeholder as Registry['profile.github.link']['types'],
  },
  'api_keys.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/api-keys',
    tokens: [{"old":"/api/v1/api-keys","type":0,"val":"api","end":""},{"old":"/api/v1/api-keys","type":0,"val":"v1","end":""},{"old":"/api/v1/api-keys","type":0,"val":"api-keys","end":""}],
    types: placeholder as Registry['api_keys.index']['types'],
  },
  'api_keys.store': {
    methods: ["POST"],
    pattern: '/api/v1/api-keys',
    tokens: [{"old":"/api/v1/api-keys","type":0,"val":"api","end":""},{"old":"/api/v1/api-keys","type":0,"val":"v1","end":""},{"old":"/api/v1/api-keys","type":0,"val":"api-keys","end":""}],
    types: placeholder as Registry['api_keys.store']['types'],
  },
  'api_keys.update': {
    methods: ["PUT"],
    pattern: '/api/v1/api-keys/:id',
    tokens: [{"old":"/api/v1/api-keys/:id","type":0,"val":"api","end":""},{"old":"/api/v1/api-keys/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/api-keys/:id","type":0,"val":"api-keys","end":""},{"old":"/api/v1/api-keys/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['api_keys.update']['types'],
  },
  'api_keys.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/api-keys/:id',
    tokens: [{"old":"/api/v1/api-keys/:id","type":0,"val":"api","end":""},{"old":"/api/v1/api-keys/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/api-keys/:id","type":0,"val":"api-keys","end":""},{"old":"/api/v1/api-keys/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['api_keys.destroy']['types'],
  },
  'llm_configurations.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/system/llm-config',
    tokens: [{"old":"/api/v1/system/llm-config","type":0,"val":"api","end":""},{"old":"/api/v1/system/llm-config","type":0,"val":"v1","end":""},{"old":"/api/v1/system/llm-config","type":0,"val":"system","end":""},{"old":"/api/v1/system/llm-config","type":0,"val":"llm-config","end":""}],
    types: placeholder as Registry['llm_configurations.show']['types'],
  },
  'llm_configurations.update': {
    methods: ["PUT"],
    pattern: '/api/v1/system/llm-config',
    tokens: [{"old":"/api/v1/system/llm-config","type":0,"val":"api","end":""},{"old":"/api/v1/system/llm-config","type":0,"val":"v1","end":""},{"old":"/api/v1/system/llm-config","type":0,"val":"system","end":""},{"old":"/api/v1/system/llm-config","type":0,"val":"llm-config","end":""}],
    types: placeholder as Registry['llm_configurations.update']['types'],
  },
  'llm_configurations.test': {
    methods: ["POST"],
    pattern: '/api/v1/system/llm-config/test',
    tokens: [{"old":"/api/v1/system/llm-config/test","type":0,"val":"api","end":""},{"old":"/api/v1/system/llm-config/test","type":0,"val":"v1","end":""},{"old":"/api/v1/system/llm-config/test","type":0,"val":"system","end":""},{"old":"/api/v1/system/llm-config/test","type":0,"val":"llm-config","end":""},{"old":"/api/v1/system/llm-config/test","type":0,"val":"test","end":""}],
    types: placeholder as Registry['llm_configurations.test']['types'],
  },
  'wecom_message_templates.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/system/wecom-message-templates',
    tokens: [{"old":"/api/v1/system/wecom-message-templates","type":0,"val":"api","end":""},{"old":"/api/v1/system/wecom-message-templates","type":0,"val":"v1","end":""},{"old":"/api/v1/system/wecom-message-templates","type":0,"val":"system","end":""},{"old":"/api/v1/system/wecom-message-templates","type":0,"val":"wecom-message-templates","end":""}],
    types: placeholder as Registry['wecom_message_templates.index']['types'],
  },
  'wecom_message_templates.store': {
    methods: ["POST"],
    pattern: '/api/v1/system/wecom-message-templates',
    tokens: [{"old":"/api/v1/system/wecom-message-templates","type":0,"val":"api","end":""},{"old":"/api/v1/system/wecom-message-templates","type":0,"val":"v1","end":""},{"old":"/api/v1/system/wecom-message-templates","type":0,"val":"system","end":""},{"old":"/api/v1/system/wecom-message-templates","type":0,"val":"wecom-message-templates","end":""}],
    types: placeholder as Registry['wecom_message_templates.store']['types'],
  },
  'wecom_message_templates.update': {
    methods: ["PUT"],
    pattern: '/api/v1/system/wecom-message-templates/:id',
    tokens: [{"old":"/api/v1/system/wecom-message-templates/:id","type":0,"val":"api","end":""},{"old":"/api/v1/system/wecom-message-templates/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/system/wecom-message-templates/:id","type":0,"val":"system","end":""},{"old":"/api/v1/system/wecom-message-templates/:id","type":0,"val":"wecom-message-templates","end":""},{"old":"/api/v1/system/wecom-message-templates/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['wecom_message_templates.update']['types'],
  },
  'wecom_message_templates.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/system/wecom-message-templates/:id',
    tokens: [{"old":"/api/v1/system/wecom-message-templates/:id","type":0,"val":"api","end":""},{"old":"/api/v1/system/wecom-message-templates/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/system/wecom-message-templates/:id","type":0,"val":"system","end":""},{"old":"/api/v1/system/wecom-message-templates/:id","type":0,"val":"wecom-message-templates","end":""},{"old":"/api/v1/system/wecom-message-templates/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['wecom_message_templates.destroy']['types'],
  },
  'wecom_message_templates.test_send': {
    methods: ["POST"],
    pattern: '/api/v1/system/wecom-message-templates/:id/test',
    tokens: [{"old":"/api/v1/system/wecom-message-templates/:id/test","type":0,"val":"api","end":""},{"old":"/api/v1/system/wecom-message-templates/:id/test","type":0,"val":"v1","end":""},{"old":"/api/v1/system/wecom-message-templates/:id/test","type":0,"val":"system","end":""},{"old":"/api/v1/system/wecom-message-templates/:id/test","type":0,"val":"wecom-message-templates","end":""},{"old":"/api/v1/system/wecom-message-templates/:id/test","type":1,"val":"id","end":""},{"old":"/api/v1/system/wecom-message-templates/:id/test","type":0,"val":"test","end":""}],
    types: placeholder as Registry['wecom_message_templates.test_send']['types'],
  },
  'system.wecom.messages.send': {
    methods: ["POST"],
    pattern: '/api/v1/system/wecom-messages/:id/send',
    tokens: [{"old":"/api/v1/system/wecom-messages/:id/send","type":0,"val":"api","end":""},{"old":"/api/v1/system/wecom-messages/:id/send","type":0,"val":"v1","end":""},{"old":"/api/v1/system/wecom-messages/:id/send","type":0,"val":"system","end":""},{"old":"/api/v1/system/wecom-messages/:id/send","type":0,"val":"wecom-messages","end":""},{"old":"/api/v1/system/wecom-messages/:id/send","type":1,"val":"id","end":""},{"old":"/api/v1/system/wecom-messages/:id/send","type":0,"val":"send","end":""}],
    types: placeholder as Registry['system.wecom.messages.send']['types'],
  },
  'knowledge_documents.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/system/knowledge-documents',
    tokens: [{"old":"/api/v1/system/knowledge-documents","type":0,"val":"api","end":""},{"old":"/api/v1/system/knowledge-documents","type":0,"val":"v1","end":""},{"old":"/api/v1/system/knowledge-documents","type":0,"val":"system","end":""},{"old":"/api/v1/system/knowledge-documents","type":0,"val":"knowledge-documents","end":""}],
    types: placeholder as Registry['knowledge_documents.index']['types'],
  },
  'knowledge_documents.store': {
    methods: ["POST"],
    pattern: '/api/v1/system/knowledge-documents',
    tokens: [{"old":"/api/v1/system/knowledge-documents","type":0,"val":"api","end":""},{"old":"/api/v1/system/knowledge-documents","type":0,"val":"v1","end":""},{"old":"/api/v1/system/knowledge-documents","type":0,"val":"system","end":""},{"old":"/api/v1/system/knowledge-documents","type":0,"val":"knowledge-documents","end":""}],
    types: placeholder as Registry['knowledge_documents.store']['types'],
  },
  'knowledge_documents.store_batch': {
    methods: ["POST"],
    pattern: '/api/v1/system/knowledge-documents/batch',
    tokens: [{"old":"/api/v1/system/knowledge-documents/batch","type":0,"val":"api","end":""},{"old":"/api/v1/system/knowledge-documents/batch","type":0,"val":"v1","end":""},{"old":"/api/v1/system/knowledge-documents/batch","type":0,"val":"system","end":""},{"old":"/api/v1/system/knowledge-documents/batch","type":0,"val":"knowledge-documents","end":""},{"old":"/api/v1/system/knowledge-documents/batch","type":0,"val":"batch","end":""}],
    types: placeholder as Registry['knowledge_documents.store_batch']['types'],
  },
  'knowledge_documents.update': {
    methods: ["PUT"],
    pattern: '/api/v1/system/knowledge-documents/:id',
    tokens: [{"old":"/api/v1/system/knowledge-documents/:id","type":0,"val":"api","end":""},{"old":"/api/v1/system/knowledge-documents/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/system/knowledge-documents/:id","type":0,"val":"system","end":""},{"old":"/api/v1/system/knowledge-documents/:id","type":0,"val":"knowledge-documents","end":""},{"old":"/api/v1/system/knowledge-documents/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['knowledge_documents.update']['types'],
  },
  'knowledge_documents.reindex': {
    methods: ["POST"],
    pattern: '/api/v1/system/knowledge-documents/:id/reindex',
    tokens: [{"old":"/api/v1/system/knowledge-documents/:id/reindex","type":0,"val":"api","end":""},{"old":"/api/v1/system/knowledge-documents/:id/reindex","type":0,"val":"v1","end":""},{"old":"/api/v1/system/knowledge-documents/:id/reindex","type":0,"val":"system","end":""},{"old":"/api/v1/system/knowledge-documents/:id/reindex","type":0,"val":"knowledge-documents","end":""},{"old":"/api/v1/system/knowledge-documents/:id/reindex","type":1,"val":"id","end":""},{"old":"/api/v1/system/knowledge-documents/:id/reindex","type":0,"val":"reindex","end":""}],
    types: placeholder as Registry['knowledge_documents.reindex']['types'],
  },
  'knowledge_documents.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/system/knowledge-documents/:id',
    tokens: [{"old":"/api/v1/system/knowledge-documents/:id","type":0,"val":"api","end":""},{"old":"/api/v1/system/knowledge-documents/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/system/knowledge-documents/:id","type":0,"val":"system","end":""},{"old":"/api/v1/system/knowledge-documents/:id","type":0,"val":"knowledge-documents","end":""},{"old":"/api/v1/system/knowledge-documents/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['knowledge_documents.destroy']['types'],
  },
  'system_status.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/system/status',
    tokens: [{"old":"/api/v1/system/status","type":0,"val":"api","end":""},{"old":"/api/v1/system/status","type":0,"val":"v1","end":""},{"old":"/api/v1/system/status","type":0,"val":"system","end":""},{"old":"/api/v1/system/status","type":0,"val":"status","end":""}],
    types: placeholder as Registry['system_status.show']['types'],
  },
  'users.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/system/users',
    tokens: [{"old":"/api/v1/system/users","type":0,"val":"api","end":""},{"old":"/api/v1/system/users","type":0,"val":"v1","end":""},{"old":"/api/v1/system/users","type":0,"val":"system","end":""},{"old":"/api/v1/system/users","type":0,"val":"users","end":""}],
    types: placeholder as Registry['users.index']['types'],
  },
  'users.store': {
    methods: ["POST"],
    pattern: '/api/v1/system/users',
    tokens: [{"old":"/api/v1/system/users","type":0,"val":"api","end":""},{"old":"/api/v1/system/users","type":0,"val":"v1","end":""},{"old":"/api/v1/system/users","type":0,"val":"system","end":""},{"old":"/api/v1/system/users","type":0,"val":"users","end":""}],
    types: placeholder as Registry['users.store']['types'],
  },
  'users.update': {
    methods: ["PUT"],
    pattern: '/api/v1/system/users/:id',
    tokens: [{"old":"/api/v1/system/users/:id","type":0,"val":"api","end":""},{"old":"/api/v1/system/users/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/system/users/:id","type":0,"val":"system","end":""},{"old":"/api/v1/system/users/:id","type":0,"val":"users","end":""},{"old":"/api/v1/system/users/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['users.update']['types'],
  },
  'users.reset_password': {
    methods: ["POST"],
    pattern: '/api/v1/system/users/:id/reset-password',
    tokens: [{"old":"/api/v1/system/users/:id/reset-password","type":0,"val":"api","end":""},{"old":"/api/v1/system/users/:id/reset-password","type":0,"val":"v1","end":""},{"old":"/api/v1/system/users/:id/reset-password","type":0,"val":"system","end":""},{"old":"/api/v1/system/users/:id/reset-password","type":0,"val":"users","end":""},{"old":"/api/v1/system/users/:id/reset-password","type":1,"val":"id","end":""},{"old":"/api/v1/system/users/:id/reset-password","type":0,"val":"reset-password","end":""}],
    types: placeholder as Registry['users.reset_password']['types'],
  },
  'users.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/system/users/:id',
    tokens: [{"old":"/api/v1/system/users/:id","type":0,"val":"api","end":""},{"old":"/api/v1/system/users/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/system/users/:id","type":0,"val":"system","end":""},{"old":"/api/v1/system/users/:id","type":0,"val":"users","end":""},{"old":"/api/v1/system/users/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['users.destroy']['types'],
  },
  'roles.catalog': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/system/roles/catalog',
    tokens: [{"old":"/api/v1/system/roles/catalog","type":0,"val":"api","end":""},{"old":"/api/v1/system/roles/catalog","type":0,"val":"v1","end":""},{"old":"/api/v1/system/roles/catalog","type":0,"val":"system","end":""},{"old":"/api/v1/system/roles/catalog","type":0,"val":"roles","end":""},{"old":"/api/v1/system/roles/catalog","type":0,"val":"catalog","end":""}],
    types: placeholder as Registry['roles.catalog']['types'],
  },
  'roles.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/system/roles',
    tokens: [{"old":"/api/v1/system/roles","type":0,"val":"api","end":""},{"old":"/api/v1/system/roles","type":0,"val":"v1","end":""},{"old":"/api/v1/system/roles","type":0,"val":"system","end":""},{"old":"/api/v1/system/roles","type":0,"val":"roles","end":""}],
    types: placeholder as Registry['roles.index']['types'],
  },
  'roles.store': {
    methods: ["POST"],
    pattern: '/api/v1/system/roles',
    tokens: [{"old":"/api/v1/system/roles","type":0,"val":"api","end":""},{"old":"/api/v1/system/roles","type":0,"val":"v1","end":""},{"old":"/api/v1/system/roles","type":0,"val":"system","end":""},{"old":"/api/v1/system/roles","type":0,"val":"roles","end":""}],
    types: placeholder as Registry['roles.store']['types'],
  },
  'roles.update': {
    methods: ["PUT"],
    pattern: '/api/v1/system/roles/:id',
    tokens: [{"old":"/api/v1/system/roles/:id","type":0,"val":"api","end":""},{"old":"/api/v1/system/roles/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/system/roles/:id","type":0,"val":"system","end":""},{"old":"/api/v1/system/roles/:id","type":0,"val":"roles","end":""},{"old":"/api/v1/system/roles/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['roles.update']['types'],
  },
  'roles.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/system/roles/:id',
    tokens: [{"old":"/api/v1/system/roles/:id","type":0,"val":"api","end":""},{"old":"/api/v1/system/roles/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/system/roles/:id","type":0,"val":"system","end":""},{"old":"/api/v1/system/roles/:id","type":0,"val":"roles","end":""},{"old":"/api/v1/system/roles/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['roles.destroy']['types'],
  },
  'permissions.catalog': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/system/permissions/catalog',
    tokens: [{"old":"/api/v1/system/permissions/catalog","type":0,"val":"api","end":""},{"old":"/api/v1/system/permissions/catalog","type":0,"val":"v1","end":""},{"old":"/api/v1/system/permissions/catalog","type":0,"val":"system","end":""},{"old":"/api/v1/system/permissions/catalog","type":0,"val":"permissions","end":""},{"old":"/api/v1/system/permissions/catalog","type":0,"val":"catalog","end":""}],
    types: placeholder as Registry['permissions.catalog']['types'],
  },
  'permissions.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/system/permissions',
    tokens: [{"old":"/api/v1/system/permissions","type":0,"val":"api","end":""},{"old":"/api/v1/system/permissions","type":0,"val":"v1","end":""},{"old":"/api/v1/system/permissions","type":0,"val":"system","end":""},{"old":"/api/v1/system/permissions","type":0,"val":"permissions","end":""}],
    types: placeholder as Registry['permissions.index']['types'],
  },
  'permissions.store': {
    methods: ["POST"],
    pattern: '/api/v1/system/permissions',
    tokens: [{"old":"/api/v1/system/permissions","type":0,"val":"api","end":""},{"old":"/api/v1/system/permissions","type":0,"val":"v1","end":""},{"old":"/api/v1/system/permissions","type":0,"val":"system","end":""},{"old":"/api/v1/system/permissions","type":0,"val":"permissions","end":""}],
    types: placeholder as Registry['permissions.store']['types'],
  },
  'permissions.update': {
    methods: ["PUT"],
    pattern: '/api/v1/system/permissions/:id',
    tokens: [{"old":"/api/v1/system/permissions/:id","type":0,"val":"api","end":""},{"old":"/api/v1/system/permissions/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/system/permissions/:id","type":0,"val":"system","end":""},{"old":"/api/v1/system/permissions/:id","type":0,"val":"permissions","end":""},{"old":"/api/v1/system/permissions/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['permissions.update']['types'],
  },
  'permissions.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/system/permissions/:id',
    tokens: [{"old":"/api/v1/system/permissions/:id","type":0,"val":"api","end":""},{"old":"/api/v1/system/permissions/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/system/permissions/:id","type":0,"val":"system","end":""},{"old":"/api/v1/system/permissions/:id","type":0,"val":"permissions","end":""},{"old":"/api/v1/system/permissions/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['permissions.destroy']['types'],
  },
  'audit_logs.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/system/audit-logs',
    tokens: [{"old":"/api/v1/system/audit-logs","type":0,"val":"api","end":""},{"old":"/api/v1/system/audit-logs","type":0,"val":"v1","end":""},{"old":"/api/v1/system/audit-logs","type":0,"val":"system","end":""},{"old":"/api/v1/system/audit-logs","type":0,"val":"audit-logs","end":""}],
    types: placeholder as Registry['audit_logs.index']['types'],
  },
  'ai_chat.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/ai-chat/conversations',
    tokens: [{"old":"/api/v1/ai-chat/conversations","type":0,"val":"api","end":""},{"old":"/api/v1/ai-chat/conversations","type":0,"val":"v1","end":""},{"old":"/api/v1/ai-chat/conversations","type":0,"val":"ai-chat","end":""},{"old":"/api/v1/ai-chat/conversations","type":0,"val":"conversations","end":""}],
    types: placeholder as Registry['ai_chat.index']['types'],
  },
  'ai_chat.store': {
    methods: ["POST"],
    pattern: '/api/v1/ai-chat/conversations',
    tokens: [{"old":"/api/v1/ai-chat/conversations","type":0,"val":"api","end":""},{"old":"/api/v1/ai-chat/conversations","type":0,"val":"v1","end":""},{"old":"/api/v1/ai-chat/conversations","type":0,"val":"ai-chat","end":""},{"old":"/api/v1/ai-chat/conversations","type":0,"val":"conversations","end":""}],
    types: placeholder as Registry['ai_chat.store']['types'],
  },
  'ai_chat.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/ai-chat/conversations/:id',
    tokens: [{"old":"/api/v1/ai-chat/conversations/:id","type":0,"val":"api","end":""},{"old":"/api/v1/ai-chat/conversations/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/ai-chat/conversations/:id","type":0,"val":"ai-chat","end":""},{"old":"/api/v1/ai-chat/conversations/:id","type":0,"val":"conversations","end":""},{"old":"/api/v1/ai-chat/conversations/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['ai_chat.show']['types'],
  },
  'ai_chat.send_message': {
    methods: ["POST"],
    pattern: '/api/v1/ai-chat/conversations/:id/messages',
    tokens: [{"old":"/api/v1/ai-chat/conversations/:id/messages","type":0,"val":"api","end":""},{"old":"/api/v1/ai-chat/conversations/:id/messages","type":0,"val":"v1","end":""},{"old":"/api/v1/ai-chat/conversations/:id/messages","type":0,"val":"ai-chat","end":""},{"old":"/api/v1/ai-chat/conversations/:id/messages","type":0,"val":"conversations","end":""},{"old":"/api/v1/ai-chat/conversations/:id/messages","type":1,"val":"id","end":""},{"old":"/api/v1/ai-chat/conversations/:id/messages","type":0,"val":"messages","end":""}],
    types: placeholder as Registry['ai_chat.send_message']['types'],
  },
  'ai_chat.steer': {
    methods: ["POST"],
    pattern: '/api/v1/ai-chat/conversations/:id/steer',
    tokens: [{"old":"/api/v1/ai-chat/conversations/:id/steer","type":0,"val":"api","end":""},{"old":"/api/v1/ai-chat/conversations/:id/steer","type":0,"val":"v1","end":""},{"old":"/api/v1/ai-chat/conversations/:id/steer","type":0,"val":"ai-chat","end":""},{"old":"/api/v1/ai-chat/conversations/:id/steer","type":0,"val":"conversations","end":""},{"old":"/api/v1/ai-chat/conversations/:id/steer","type":1,"val":"id","end":""},{"old":"/api/v1/ai-chat/conversations/:id/steer","type":0,"val":"steer","end":""}],
    types: placeholder as Registry['ai_chat.steer']['types'],
  },
  'ai_chat.follow_up': {
    methods: ["POST"],
    pattern: '/api/v1/ai-chat/conversations/:id/follow-up',
    tokens: [{"old":"/api/v1/ai-chat/conversations/:id/follow-up","type":0,"val":"api","end":""},{"old":"/api/v1/ai-chat/conversations/:id/follow-up","type":0,"val":"v1","end":""},{"old":"/api/v1/ai-chat/conversations/:id/follow-up","type":0,"val":"ai-chat","end":""},{"old":"/api/v1/ai-chat/conversations/:id/follow-up","type":0,"val":"conversations","end":""},{"old":"/api/v1/ai-chat/conversations/:id/follow-up","type":1,"val":"id","end":""},{"old":"/api/v1/ai-chat/conversations/:id/follow-up","type":0,"val":"follow-up","end":""}],
    types: placeholder as Registry['ai_chat.follow_up']['types'],
  },
  'ai_chat.confirm_ai_agent_action': {
    methods: ["POST"],
    pattern: '/api/v1/ai-chat/conversations/:id/confirmations/:confirmationId/confirm',
    tokens: [{"old":"/api/v1/ai-chat/conversations/:id/confirmations/:confirmationId/confirm","type":0,"val":"api","end":""},{"old":"/api/v1/ai-chat/conversations/:id/confirmations/:confirmationId/confirm","type":0,"val":"v1","end":""},{"old":"/api/v1/ai-chat/conversations/:id/confirmations/:confirmationId/confirm","type":0,"val":"ai-chat","end":""},{"old":"/api/v1/ai-chat/conversations/:id/confirmations/:confirmationId/confirm","type":0,"val":"conversations","end":""},{"old":"/api/v1/ai-chat/conversations/:id/confirmations/:confirmationId/confirm","type":1,"val":"id","end":""},{"old":"/api/v1/ai-chat/conversations/:id/confirmations/:confirmationId/confirm","type":0,"val":"confirmations","end":""},{"old":"/api/v1/ai-chat/conversations/:id/confirmations/:confirmationId/confirm","type":1,"val":"confirmationId","end":""},{"old":"/api/v1/ai-chat/conversations/:id/confirmations/:confirmationId/confirm","type":0,"val":"confirm","end":""}],
    types: placeholder as Registry['ai_chat.confirm_ai_agent_action']['types'],
  },
  'ai_chat.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/ai-chat/conversations/:id',
    tokens: [{"old":"/api/v1/ai-chat/conversations/:id","type":0,"val":"api","end":""},{"old":"/api/v1/ai-chat/conversations/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/ai-chat/conversations/:id","type":0,"val":"ai-chat","end":""},{"old":"/api/v1/ai-chat/conversations/:id","type":0,"val":"conversations","end":""},{"old":"/api/v1/ai-chat/conversations/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['ai_chat.destroy']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}

/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
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
  'auth.new_account.store': {
    methods: ["POST"],
    pattern: '/api/v1/auth/signup',
    tokens: [{"old":"/api/v1/auth/signup","type":0,"val":"api","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['auth.new_account.store']['types'],
  },
  'auth.access_tokens.store': {
    methods: ["POST"],
    pattern: '/api/v1/auth/login',
    tokens: [{"old":"/api/v1/auth/login","type":0,"val":"api","end":""},{"old":"/api/v1/auth/login","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/login","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['auth.access_tokens.store']['types'],
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
  'profile.access_tokens.destroy': {
    methods: ["POST"],
    pattern: '/api/v1/account/logout',
    tokens: [{"old":"/api/v1/account/logout","type":0,"val":"api","end":""},{"old":"/api/v1/account/logout","type":0,"val":"v1","end":""},{"old":"/api/v1/account/logout","type":0,"val":"account","end":""},{"old":"/api/v1/account/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['profile.access_tokens.destroy']['types'],
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
    methods: ["PUT","PATCH"],
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

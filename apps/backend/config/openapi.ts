import { defineConfig } from '@foadonis/openapi'

export default defineConfig({
  ui: 'scalar',
  document: {
    openapi: '3.1.0',
    info: {
      title: 'API Starter Kit',
      version: '0.1.0',
      description: '全栈应用模板 API，提供认证、双因素认证和 API Key 管理功能。',
    },
    servers: [
      {
        url: '/',
        description: '当前版本 API',
      },
    ],
    tags: [
      { name: 'Auth', description: '管理员登录、会话和双重身份验证' },
      { name: 'Account', description: '管理员资料、密码和安全设置' },
      { name: 'API Keys', description: '外部系统接入密钥管理' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: '管理员登录后返回的 Bearer Token。',
        },
      },
    },
  },
})

import router from '@adonisjs/core/services/router'
import db from '@adonisjs/lucid/services/db'
import openapi from '@foadonis/openapi/services/main'

import { controllers } from '#generated/controllers'
import { middleware } from '#start/kernel'

const ApiKeysController = () => import('#controllers/api_keys_controller')
const AiChatController = () => import('#controllers/ai_chat_controller')
const AuditLogsController = () => import('#controllers/audit_logs_controller')
const GithubOauthController = () => import('#controllers/github_oauth_controller')
const KnowledgeDocumentsController = () => import('#controllers/knowledge_documents_controller')
const PermissionsController = () => import('#controllers/permissions_controller')
const RolesController = () => import('#controllers/roles_controller')
const TwoFactorAuthController = () => import('#controllers/two_factor_auth_controller')
const UsersController = () => import('#controllers/users_controller')
const WecomMessageTemplatesController = () =>
  import('#controllers/wecom_message_templates_controller')
const SystemStatusController = () => import('#controllers/system_status_controller')

router
  .post('/api/v1/wecom-messages/:id/send', [WecomMessageTemplatesController, 'send'])
  .as('wecom.messages.send')
  .use(middleware.apiKey())
  .use(middleware.throttle({ max: 20, windowSeconds: 60, key: 'ip' }))

router.get('/api/v1/health', () => {
  return { status: 'ok' }
})

router.get('/api/v1/health/ready', async ({ response }) => {
  const checks: Record<string, string> = {}
  let healthy = true

  try {
    await db.rawQuery('SELECT 1')
    checks.database = 'ok'
  } catch {
    checks.database = 'error'
    healthy = false
  }

  checks.ai = process.env.AI_OPENAI_API_KEY ? 'configured' : 'not_configured'

  if (!healthy) {
    return response.status(503).send({ status: 'error', checks })
  }
  return { status: 'ok', checks }
})

// OpenAPI docs (Scalar UI) are served directly by the backend on its own port.
// Enable via OPENAPI_DOCS_ENABLED=true; the route is not registered when disabled.
if (process.env.OPENAPI_DOCS_ENABLED === 'true') {
  openapi.registerRoutes('/api-docs')
}

router
  .group(() => {
    router
      .group(() => {
        router.post('signup', [controllers.NewAccount, 'store']).as('signup')
        router.post('login', [controllers.AccessTokens, 'store']).as('login')
        router.get('github', [GithubOauthController, 'redirect']).as('github.redirect')
        router.get('github/callback', [GithubOauthController, 'callback']).as('github.callback')
        router.post('github/exchange', [GithubOauthController, 'exchange']).as('github.exchange')
        router.post('2fa/verify', [TwoFactorAuthController, 'verify']).as('2fa.verify')
      })
      .prefix('auth')
      .as('auth')
      .use(middleware.throttle({ max: 10, windowSeconds: 60, key: 'ip' }))

    router
      .group(() => {
        router.get('profile', [controllers.Profile, 'show'])
        router.put('password', [controllers.Profile, 'changePassword'])
        router.post('2fa/generate', [TwoFactorAuthController, 'generate']).as('2fa.generate')
        router.post('2fa/enable', [TwoFactorAuthController, 'enable']).as('2fa.enable')
        router.post('2fa/disable', [controllers.Profile, 'disableTwoFactor'])
        router.post('logout', [controllers.AccessTokens, 'destroy'])
      })
      .prefix('account')
      .as('profile')
      .use(middleware.auth())
      .use(middleware.throttle({ max: 30, windowSeconds: 60, key: 'user' }))

    router
      .get('api-keys', [ApiKeysController, 'index'])
      .use(middleware.auth())
      .use(middleware.permission(['api-keys:read']))
    router
      .post('api-keys', [ApiKeysController, 'store'])
      .use(middleware.auth())
      .use(middleware.permission(['api-keys:create']))
    router
      .put('api-keys/:id', [ApiKeysController, 'update'])
      .use(middleware.auth())
      .use(middleware.permission(['api-keys:update']))
    router
      .delete('api-keys/:id', [ApiKeysController, 'destroy'])
      .use(middleware.auth())
      .use(middleware.permission(['api-keys:delete']))

    router
      .group(() => {
        router
          .get('wecom-message-templates', [WecomMessageTemplatesController, 'index'])
          .use(middleware.permission(['wecom-templates:read']))
        router
          .post('wecom-message-templates', [WecomMessageTemplatesController, 'store'])
          .use(middleware.permission(['wecom-templates:create']))
        router
          .put('wecom-message-templates/:id', [WecomMessageTemplatesController, 'update'])
          .use(middleware.permission(['wecom-templates:update']))
        router
          .delete('wecom-message-templates/:id', [WecomMessageTemplatesController, 'destroy'])
          .use(middleware.permission(['wecom-templates:delete']))
        router
          .post('wecom-message-templates/:id/test', [WecomMessageTemplatesController, 'testSend'])
          .use(middleware.permission(['wecom-templates:test']))
          .use(middleware.throttle({ max: 20, windowSeconds: 60, key: 'user' }))
        router
          .post('wecom-messages/:id/send', [WecomMessageTemplatesController, 'send'])
          .as('system.wecom.messages.send')
          .use(middleware.permission(['wecom-templates:send']))
          .use(middleware.throttle({ max: 20, windowSeconds: 60, key: 'user' }))
      })
      .prefix('system')
      .use(middleware.auth())

    router
      .group(() => {
        router.get('knowledge-documents', [KnowledgeDocumentsController, 'index'])
        router.post('knowledge-documents', [KnowledgeDocumentsController, 'store'])
        router.put('knowledge-documents/:id', [KnowledgeDocumentsController, 'update'])
        router.post('knowledge-documents/:id/reindex', [KnowledgeDocumentsController, 'reindex'])
        router.delete('knowledge-documents/:id', [KnowledgeDocumentsController, 'destroy'])
      })
      .prefix('system')
      .use(middleware.auth())
      .use(middleware.permission(['knowledge:manage']))

    router
      .group(() => {
        router
          .get('status', [SystemStatusController, 'show'])
          .use(middleware.permission(['system-status:read']))
        router.get('users', [UsersController, 'index']).use(middleware.permission(['users:read']))
        router
          .post('users', [UsersController, 'store'])
          .use(middleware.permission(['users:create']))
        router
          .put('users/:id', [UsersController, 'update'])
          .use(middleware.permission(['users:update']))
        router
          .post('users/:id/reset-password', [UsersController, 'resetPassword'])
          .use(middleware.permission(['users:update']))
        router
          .delete('users/:id', [UsersController, 'destroy'])
          .use(middleware.permission(['users:delete']))
        router
          .get('roles/catalog', [RolesController, 'catalog'])
          .use(middleware.permission(['roles:read']))
        router.get('roles', [RolesController, 'index']).use(middleware.permission(['roles:read']))
        router
          .post('roles', [RolesController, 'store'])
          .use(middleware.permission(['roles:create']))
        router
          .put('roles/:id', [RolesController, 'update'])
          .use(middleware.permission(['roles:update']))
        router
          .delete('roles/:id', [RolesController, 'destroy'])
          .use(middleware.permission(['roles:delete']))
        router
          .get('permissions/catalog', [PermissionsController, 'catalog'])
          .use(middleware.permission(['permissions:read']))
        router
          .get('permissions', [PermissionsController, 'index'])
          .use(middleware.permission(['permissions:read']))
        router
          .post('permissions', [PermissionsController, 'store'])
          .use(middleware.permission(['permissions:create']))
        router
          .put('permissions/:id', [PermissionsController, 'update'])
          .use(middleware.permission(['permissions:update']))
        router
          .delete('permissions/:id', [PermissionsController, 'destroy'])
          .use(middleware.permission(['permissions:delete']))
        router
          .get('audit-logs', [AuditLogsController, 'index'])
          .use(middleware.permission(['audit-logs:read']))
      })
      .prefix('system')
      .use(middleware.auth())

    router
      .group(() => {
        router.get('conversations', [AiChatController, 'index'])
        router.post('conversations', [AiChatController, 'store'])
        router.get('conversations/:id', [AiChatController, 'show'])
        router.post('conversations/:id/messages', [AiChatController, 'sendMessage'])
        router.post('conversations/:id/resume', [AiChatController, 'resume'])
        router.post('conversations/:id/confirmations/:confirmationId/confirm', [
          AiChatController,
          'confirmAiAgentAction',
        ])
        router.delete('conversations/:id', [AiChatController, 'destroy'])
      })
      .prefix('ai-chat')
      .use(middleware.auth())
      .use(middleware.throttle({ max: 20, windowSeconds: 60, key: 'user' }))
  })
  .prefix('/api/v1')

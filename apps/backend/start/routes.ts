import router from '@adonisjs/core/services/router'
import openapi from '@foadonis/openapi/services/main'

import { controllers } from '#generated/controllers'
import { middleware } from '#start/kernel'

const ApiKeysController = () => import('#controllers/api_keys_controller')
const AiChatController = () => import('#controllers/ai_chat_controller')
const AuditLogsController = () => import('#controllers/audit_logs_controller')
const PermissionsController = () => import('#controllers/permissions_controller')
const RolesController = () => import('#controllers/roles_controller')
const TwoFactorAuthController = () => import('#controllers/two_factor_auth_controller')
const UsersController = () => import('#controllers/users_controller')

router.get('/api/v1/health', () => {
  return {
    status: 'ok',
  }
})

openapi.registerRoutes('/api-docs')

router
  .group(() => {
    router
      .group(() => {
        router.post('signup', [controllers.NewAccount, 'store'])
        router.post('login', [controllers.AccessTokens, 'store'])
        router.post('2fa/verify', [TwoFactorAuthController, 'verify']).as('2fa.verify')
      })
      .prefix('auth')
      .as('auth')

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
        router.post('conversations/:id/confirmations/:confirmationId/confirm', [
          AiChatController,
          'confirmAiAgentAction',
        ])
        router.delete('conversations/:id', [AiChatController, 'destroy'])
      })
      .prefix('ai-chat')
      .use(middleware.auth())
  })
  .prefix('/api/v1')

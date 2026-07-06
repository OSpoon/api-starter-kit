import router from '@adonisjs/core/services/router'
import openapi from '@foadonis/openapi/services/main'

import { controllers } from '#generated/controllers'
import { middleware } from '#start/kernel'

const ApiKeysController = () => import('#controllers/api_keys_controller')
const TwoFactorAuthController = () => import('#controllers/two_factor_auth_controller')

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
      .group(() => {
        router
          .resource('api-keys', ApiKeysController)
          .apiOnly()
          .only(['index', 'store', 'update', 'destroy'])
      })
      .use(middleware.auth())
  })
  .prefix('/api/v1')

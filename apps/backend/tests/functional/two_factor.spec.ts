import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import { generateSync } from 'otplib'

import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'

test.group('two-factor auth', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  async function createAdmin() {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const plainPassword = generateInitialPassword()
    const user = await User.create({
      fullName: '2FA Admin',
      email: `2fa-${Date.now()}@example.com`,
      password: plainPassword,
    })
    await user.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(user)
    return { user, plainPassword, bearerToken: token.value!.release() }
  }

  test('generates 2FA secret and qr code', async ({ client }) => {
    const { bearerToken } = await createAdmin()

    const response = await client.post('/api/v1/account/2fa/generate').bearerToken(bearerToken)

    response.assertStatus(200)
    response.assertBodyContains({ data: { secret: String, qrCode: String } })
  })

  test('enables 2FA with a valid TOTP code and returns recovery codes', async ({
    client,
    assert,
  }) => {
    const { user, bearerToken } = await createAdmin()

    const generate = await client.post('/api/v1/account/2fa/generate').bearerToken(bearerToken)
    const secret = (generate.body().data as { secret: string }).secret

    const enable = await client
      .post('/api/v1/account/2fa/enable')
      .bearerToken(bearerToken)
      .json({ secret, token: generateSync({ secret }) })

    enable.assertStatus(200)
    const body = enable.body().data as {
      recoveryCodes: string[]
      user: { twoFactorEnabled: boolean }
    }
    assert.lengthOf(body.recoveryCodes, 8)
    assert.isTrue(body.user.twoFactorEnabled)

    await user.refresh()
    assert.isTrue(user.twoFactorEnabled)
    assert.isNotNull(user.twoFactorSecret)
    assert.isNotNull(user.twoFactorRecoveryCodes)
  })

  test('rejects 2FA enable with an invalid TOTP code', async ({ client }) => {
    const { bearerToken } = await createAdmin()

    const generate = await client.post('/api/v1/account/2fa/generate').bearerToken(bearerToken)
    const secret = (generate.body().data as { secret: string }).secret

    const enable = await client
      .post('/api/v1/account/2fa/enable')
      .bearerToken(bearerToken)
      .json({ secret, token: '000000' })

    enable.assertStatus(400)
  })

  test('completes 2FA login flow with a valid TOTP code', async ({ client, assert }) => {
    const { user, plainPassword } = await createAdmin()

    const adminTokenObj = await User.accessTokens.create(user)
    const adminToken = adminTokenObj.value!.release()
    const generate = await client.post('/api/v1/account/2fa/generate').bearerToken(adminToken)
    const secret = (generate.body().data as { secret: string }).secret

    const enableResponse = await client
      .post('/api/v1/account/2fa/enable')
      .bearerToken(adminToken)
      .json({ secret, token: generateSync({ secret }) })
    const recoveryCodes = (enableResponse.body().data as { recoveryCodes: string[] }).recoveryCodes

    const login = await client.post('/api/v1/auth/login').json({
      email: user.email,
      password: plainPassword,
    })
    login.assertStatus(200)
    const loginData = login.body().data as { requiresTwoFactor: boolean; tempToken: string }
    assert.isTrue(loginData.requiresTwoFactor)

    const verify = await client.post('/api/v1/auth/2fa/verify').json({
      tempToken: loginData.tempToken,
      code: generateSync({ secret }),
    })
    verify.assertStatus(200)
    const verifyData = verify.body().data as { token: string }
    assert.isString(verifyData.token)

    // Recovery codes should still have all 8 (not used)
    assert.lengthOf(recoveryCodes, 8)
  })

  test('completes 2FA login with a recovery code (one-time use)', async ({ client }) => {
    const { user, plainPassword } = await createAdmin()

    const adminTokenObj = await User.accessTokens.create(user)
    const adminToken = adminTokenObj.value!.release()
    const generate = await client.post('/api/v1/account/2fa/generate').bearerToken(adminToken)
    const secret = (generate.body().data as { secret: string }).secret

    const enableResponse = await client
      .post('/api/v1/account/2fa/enable')
      .bearerToken(adminToken)
      .json({ secret, token: generateSync({ secret }) })
    const recoveryCodes = (enableResponse.body().data as { recoveryCodes: string[] }).recoveryCodes
    const recoveryCode = recoveryCodes[0]!

    const login = await client.post('/api/v1/auth/login').json({
      email: user.email,
      password: plainPassword,
    })
    const tempToken = (login.body().data as { tempToken: string }).tempToken

    const verify = await client
      .post('/api/v1/auth/2fa/verify')
      .json({ tempToken, code: recoveryCode })
    verify.assertStatus(200)

    // The same recovery code should not work a second time
    const secondLogin = await client.post('/api/v1/auth/login').json({
      email: user.email,
      password: plainPassword,
    })
    const secondTempToken = (secondLogin.body().data as { tempToken: string }).tempToken

    const reuse = await client
      .post('/api/v1/auth/2fa/verify')
      .json({ tempToken: secondTempToken, code: recoveryCode })
    reuse.assertStatus(401)
  })

  test('rejects 2FA verify with an invalid temp token', async ({ client }) => {
    const verify = await client.post('/api/v1/auth/2fa/verify').json({
      tempToken: 'invalid-token',
      code: '123456',
    })
    verify.assertStatus(401)
  })
})

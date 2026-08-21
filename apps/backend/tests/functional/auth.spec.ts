import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import GithubIdentity from '#models/github_identity'
import User from '#models/user'
import { createGithubLoginChallenge } from '#services/github_oauth'

test.group('auth api', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('blocks self signup', async ({ client }) => {
    const email = `user-${Date.now()}@example.com`
    const password = 'password123'

    const signup = await client.post('/api/v1/auth/signup').json({
      fullName: 'Template User',
      email,
      password,
      passwordConfirmation: password,
    })

    signup.assertStatus(403)
    signup.assertBodyContains({
      message: '管理员账号由环境变量自动创建，请使用 ADMIN_EMAIL 和 ADMIN_PASSWORD 配置。',
    })
  })

  test('logs in, reads profile, and logs out', async ({ client, assert }) => {
    const email = `admin-${Date.now()}@example.com`
    const password = 'Rugged-Velvet-Harbor-9281-Quartz'

    await User.create({
      fullName: 'Admin',
      email,
      password,
    })

    const login = await client.post('/api/v1/auth/login').json({
      email,
      password,
    })

    login.assertStatus(200)
    login.assertBodyContains({
      data: {
        user: {
          email,
          fullName: 'Admin',
        },
      },
    })

    const loginData = login.body().data as { token: string }
    const token = loginData.token
    assert.isString(token)

    const profile = await client.get('/api/v1/account/profile').bearerToken(token)

    profile.assertStatus(200)
    profile.assertBodyContains({
      data: {
        email,
        fullName: 'Admin',
      },
    })

    const logout = await client.post('/api/v1/account/logout').bearerToken(token)

    logout.assertStatus(200)
    logout.assertBodyContains({
      message: 'Logged out successfully',
    })
  })

  test('reads GitHub binding status and requires the password to unlink it', async ({
    client,
    assert,
  }) => {
    const email = `github-unlink-${Date.now()}@example.com`
    const password = 'Rugged-Velvet-Harbor-9281-Quartz'
    const user = await User.create({ email, password })
    await GithubIdentity.create({
      userId: user.id,
      githubId: String(900000 + user.id),
      githubLogin: 'linked-user',
    })

    const login = await client.post('/api/v1/auth/login').json({ email, password })
    const token = (login.body().data as { token: string }).token

    const profile = await client.get('/api/v1/account/profile').bearerToken(token)
    profile.assertStatus(200)
    profile.assertBodyContains({ data: { githubLinked: true } })

    const invalidUnlink = await client
      .post('/api/v1/account/github/unlink')
      .bearerToken(token)
      .json({ password: 'wrong-password' })
    invalidUnlink.assertStatus(400)

    const unlink = await client
      .post('/api/v1/account/github/unlink')
      .bearerToken(token)
      .json({ password })
    unlink.assertStatus(200)
    unlink.assertBodyContains({ data: { githubLinked: false } })
    assert.isNull(await GithubIdentity.findBy('userId', user.id))
  })

  test('completes an unbound GitHub login with local credentials', async ({ client, assert }) => {
    const email = `github-complete-${Date.now()}@example.com`
    const password = 'Rugged-Velvet-Harbor-9281-Quartz'
    const user = await User.create({ email, password })
    const code = await createGithubLoginChallenge({
      githubId: String(910000 + user.id),
      githubLogin: 'pending-login',
      email: 'github@example.com',
    })

    const completion = await client.post('/api/v1/auth/github/complete').json({
      code,
      email,
      password,
    })

    completion.assertStatus(200)
    completion.assertBodyContains({ data: { user: { email } } })
    assert.isNotNull(await GithubIdentity.findBy('userId', user.id))
  })

  test('logs in with valid credentials', async ({ client, assert }) => {
    const email = `login-${Date.now()}@example.com`
    const password = 'violet-solar-eclipse-canyon-9281!'

    await User.create({
      fullName: null,
      email,
      password,
    })

    const login = await client.post('/api/v1/auth/login').json({
      email,
      password,
    })

    login.assertStatus(200)
    login.assertBodyContains({
      data: {
        user: {
          email,
        },
      },
    })
    const loginData = login.body().data as { token: string }
    assert.isString(loginData.token)
  })

  test('locks account after repeated login failures', async ({ client }) => {
    const email = `locked-${Date.now()}@example.com`
    const password = 'anchor museum velvet horizon 9281!'

    await User.create({
      fullName: null,
      email,
      password,
    })

    for (let index = 0; index < 5; index += 1) {
      const failed = await client.post('/api/v1/auth/login').json({
        email,
        password: 'wrong-password',
      })
      failed.assertStatus(401)
    }

    const locked = await client.post('/api/v1/auth/login').json({
      email,
      password,
    })

    locked.assertStatus(401)
    locked.assertBodyContains({ code: 'E_AUTH_INVALID_CREDENTIALS' })
  })

  test('allows login with a password changed through the profile endpoint', async ({ client }) => {
    const email = `password-change-${Date.now()}@example.com`
    const oldPassword = 'Orchard-Slate-Meteor-7281!'
    const newPassword = 'Lantern-Violet-Quartz-8412!'
    const user = await User.create({ fullName: 'Password user', email, password: oldPassword })
    const token = await User.accessTokens.create(user)

    const changed = await client
      .put('/api/v1/account/password')
      .bearerToken(token.value!.release())
      .json({
        currentPassword: oldPassword,
        password: newPassword,
        passwordConfirmation: newPassword,
      })
    changed.assertStatus(200)

    const login = await client.post('/api/v1/auth/login').json({ email, password: newPassword })
    login.assertStatus(200)
  })
})

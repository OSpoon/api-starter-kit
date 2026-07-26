import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import GithubIdentity from '#models/github_identity'
import User from '#models/user'
import {
  consumeGithubLoginExchange,
  createGithubLoginExchange,
  findOrLinkGithubUser,
  githubFrontendLoginUrl,
  githubOAuthErrors,
} from '#services/github_oauth'

async function assertGithubError(
  assert: { equal(actual: unknown, expected: unknown): void; fail(message: string): never },
  action: () => Promise<unknown>,
  expectedCode: string
) {
  try {
    await action()
    assert.fail('Expected GitHub OAuth operation to fail')
  } catch (cause) {
    assert.equal((cause as { code?: string }).code, expectedCode)
  }
}

test.group('GitHub OAuth account binding', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('builds a frontend callback URL without stale query parameters', ({ assert }) => {
    const url = githubFrontendLoginUrl('http://localhost:18080/login?code=stale#ignored', {
      github_code: 'exchange-code',
    })

    assert.equal(url, 'http://localhost:18080/login?github_code=exchange-code')
  })

  test('automatically binds GitHub with an existing user email', async ({ assert }) => {
    const user = await User.create({
      email: `github-${Date.now()}@example.com`,
      password: 'Harbor-Violet-Quartz-9821!',
    })

    const linkedUser = await findOrLinkGithubUser({
      githubId: '10001',
      githubLogin: 'template-admin',
      email: user.email,
    })

    assert.equal(linkedUser.id, user.id)
    const identity = await GithubIdentity.findByOrFail('githubId', '10001')
    assert.equal(identity.userId, user.id)
  })

  test('rejects an unlinked GitHub email and a second identity for the same user', async ({
    assert,
  }) => {
    await assertGithubError(
      assert,
      () =>
        findOrLinkGithubUser({
          githubId: '10002',
          githubLogin: 'unknown-user',
          email: `unknown-${Date.now()}@example.com`,
        }),
      githubOAuthErrors.accountNotLinked.code
    )

    const user = await User.create({
      email: `github-conflict-${Date.now()}@example.com`,
      password: 'Harbor-Violet-Quartz-9821!',
    })
    await GithubIdentity.create({
      userId: user.id,
      githubId: '10003',
      githubLogin: 'original-account',
    })

    await assertGithubError(
      assert,
      () =>
        findOrLinkGithubUser({
          githubId: '10004',
          githubLogin: 'second-account',
          email: user.email,
        }),
      githubOAuthErrors.accountConflict.code
    )
  })

  test('removes a legacy binding when the GitHub email no longer matches', async ({ assert }) => {
    const user = await User.create({
      email: `github-mismatch-${Date.now()}@example.com`,
      password: 'Harbor-Violet-Quartz-9821!',
    })
    await GithubIdentity.create({
      userId: user.id,
      githubId: '10005',
      githubLogin: 'legacy-account',
    })

    await assertGithubError(
      assert,
      () =>
        findOrLinkGithubUser({
          githubId: '10005',
          githubLogin: 'legacy-account',
          email: 'different@example.com',
        }),
      githubOAuthErrors.accountNotLinked.code
    )
    assert.isNull(await GithubIdentity.findBy('githubId', '10005'))
  })

  test('exchanges a GitHub login code only once', async ({ assert }) => {
    const user = await User.create({
      email: `github-exchange-${Date.now()}@example.com`,
      password: 'Harbor-Violet-Quartz-9821!',
    })
    const code = await createGithubLoginExchange(user.id)

    const consumedUser = await consumeGithubLoginExchange(code)
    assert.equal(consumedUser.id, user.id)
    await assertGithubError(
      assert,
      () => consumeGithubLoginExchange(code),
      githubOAuthErrors.invalidExchange.code
    )
  })
})

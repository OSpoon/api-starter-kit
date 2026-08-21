import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import GithubIdentity from '#models/github_identity'
import User from '#models/user'
import {
  consumeGithubLinkState,
  consumeGithubLoginChallenge,
  consumeGithubLoginExchange,
  createGithubLinkState,
  createGithubLoginChallenge,
  createGithubLoginExchange,
  findOrLinkGithubUser,
  githubFrontendLoginUrl,
  githubOAuthErrors,
  linkGithubIdentity,
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

  test('does not automatically bind an existing user email', async ({ assert }) => {
    await assertGithubError(
      assert,
      () => findOrLinkGithubUser({ githubId: '10001' }),
      githubOAuthErrors.accountNotLinked.code
    )
    assert.isNull(await GithubIdentity.findBy('githubId', '10001'))
  })

  test('rejects an unlinked GitHub account and a second identity for the same user', async ({
    assert,
  }) => {
    await assertGithubError(
      assert,
      () =>
        findOrLinkGithubUser({
          githubId: '10002',
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
      () => linkGithubIdentity(user, { githubId: '10004', githubLogin: 'second-account' }),
      githubOAuthErrors.accountConflict.code
    )
  })

  test('uses the stable GitHub identity for subsequent login', async ({ assert }) => {
    const user = await User.create({
      email: `github-mismatch-${Date.now()}@example.com`,
      password: 'Harbor-Violet-Quartz-9821!',
    })
    await GithubIdentity.create({
      userId: user.id,
      githubId: '10005',
      githubLogin: 'legacy-account',
    })

    const linkedUser = await findOrLinkGithubUser({ githubId: '10005' })
    assert.equal(linkedUser.id, user.id)
    assert.isNotNull(await GithubIdentity.findBy('githubId', '10005'))
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

  test('binds a GitHub account only from an authenticated link state', async ({ assert }) => {
    const user = await User.create({
      email: `github-link-${Date.now()}@example.com`,
      password: 'Harbor-Violet-Quartz-9821!',
    })
    const state = await createGithubLinkState(user.id)
    const consumedUser = await consumeGithubLinkState(state)

    assert.equal(consumedUser.id, user.id)
    await assertGithubError(
      assert,
      () => consumeGithubLinkState(state),
      githubOAuthErrors.invalidState.code
    )
  })

  test('keeps an unlinked GitHub login challenge short-lived and single-use', async ({
    assert,
  }) => {
    const code = await createGithubLoginChallenge({
      githubId: '10006',
      githubLogin: 'pending-account',
      email: 'pending@example.com',
    })
    const identity = await consumeGithubLoginChallenge(
      `${code}?code=stale&iss=https%3A%2F%2Fgithub.com`
    )

    assert.deepEqual(identity, {
      githubId: '10006',
      githubLogin: 'pending-account',
      email: 'pending@example.com',
    })
    await assertGithubError(
      assert,
      () => consumeGithubLoginChallenge(code),
      githubOAuthErrors.invalidExchange.code
    )
  })
})

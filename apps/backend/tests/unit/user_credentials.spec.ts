import { errors as authErrors } from '@adonisjs/auth'
import { test } from '@japa/runner'

import User from '#models/user'
import { verifyUserCredentials } from '#security/user_credentials'

test.group('user credentials', () => {
  test('only converts invalid credentials to null', async ({ assert }) => {
    const originalVerifyCredentials = User.verifyCredentials
    const infrastructureError = new Error('password hash service unavailable')

    try {
      User.verifyCredentials = async () => {
        throw new authErrors.E_INVALID_CREDENTIALS('Invalid credentials')
      }
      assert.isNull(await verifyUserCredentials('user@example.com', 'wrong-password'))

      User.verifyCredentials = async () => {
        throw infrastructureError
      }
      await assert.rejects(
        () => verifyUserCredentials('user@example.com', 'password'),
        /password hash service unavailable/
      )
    } finally {
      User.verifyCredentials = originalVerifyCredentials
    }
  })
})

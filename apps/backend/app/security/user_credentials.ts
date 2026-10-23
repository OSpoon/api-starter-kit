import crypto from 'node:crypto'

import { errors as authErrors } from '@adonisjs/auth'

import User from '#models/user'

export function generateInitialPassword() {
  return `${crypto.randomBytes(8).toString('base64url')}aA1!`
}

export async function verifyUserCredentials(email: string, password: string) {
  try {
    return await User.verifyCredentials(email, password)
  } catch (error) {
    if (error instanceof authErrors.E_INVALID_CREDENTIALS) return null
    throw error
  }
}

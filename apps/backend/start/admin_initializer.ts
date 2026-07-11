import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'

import Role from '#models/role'
import User from '#models/user'
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  isStrongPassword,
  PASSWORD_MAX_LENGTH,
  passwordContext,
} from '#services/password_strength'
import env from '#start/env'

async function ensureAdminUser() {
  const email = env.get('ADMIN_EMAIL')
  const password = env.get('ADMIN_PASSWORD')
  const fullName = env.get('ADMIN_FULL_NAME') ?? 'Admin'

  if (!email || !password) {
    logger.warn('ADMIN_EMAIL and ADMIN_PASSWORD are not configured; admin auto-create skipped')
    return
  }

  if (password.length < ADMIN_PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    logger.warn(
      `ADMIN_PASSWORD must be between ${ADMIN_PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters; admin auto-create skipped`
    )
    return
  }

  if (!isStrongPassword(password, passwordContext([email, fullName]))) {
    logger.warn(
      'ADMIN_PASSWORD is too weak; it must include uppercase, lowercase, number, and symbol, and must not include account or product details; admin auto-create skipped'
    )
    return
  }

  const existingUsers = await User.query().count('* as total').first()
  if (Number(existingUsers?.$extras.total ?? 0) > 0) {
    return
  }

  const user = await User.create({
    email,
    password,
    fullName,
  })
  const superAdmin = await Role.findBy('code', 'super-admin')
  if (superAdmin) {
    await user.related('roles').attach([superAdmin.id])
  }
  logger.info({ email }, 'Default administrator created from environment variables')
}

if (app.getEnvironment() === 'web') {
  ensureAdminUser().catch((error) => {
    logger.error({ err: error }, 'Failed to auto-create administrator')
  })
}

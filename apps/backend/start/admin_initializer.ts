import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'

import User from '#models/user'
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  isStrongPassword,
  PASSWORD_MAX_LENGTH,
  passwordContext,
} from '#security/password_strength'
import { lockSuperAdminRole } from '#services/super_admin_access'
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

  const result = await db.transaction(async (trx) => {
    const superAdmin = await lockSuperAdminRole(trx)
    const existingAdmin = await User.query({ client: trx })
      .where('email', email)
      .forUpdate()
      .first()

    if (existingAdmin?.disabledAt) return 'disabled'

    const user =
      existingAdmin ??
      (await User.create(
        {
          email,
          password,
          fullName,
        },
        { client: trx }
      ))

    await user.related('roles').sync([superAdmin.id], false, trx)
    return existingAdmin ? 'existing' : 'created'
  })

  if (result === 'disabled') {
    logger.error(
      { email },
      'Configured administrator account is disabled; it was not reactivated automatically'
    )
    return
  }

  logger.info(
    { email },
    result === 'created'
      ? 'Default administrator created from environment variables'
      : 'Configured administrator ensured from environment variables'
  )
}

if (app.getEnvironment() === 'web') {
  ensureAdminUser().catch((error) => {
    logger.error({ err: error }, 'Failed to auto-create administrator')
  })
}

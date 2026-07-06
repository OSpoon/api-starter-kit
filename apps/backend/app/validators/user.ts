import vine from '@vinejs/vine'

import {
  ADMIN_PASSWORD_MIN_LENGTH,
  isStrongPassword,
  PASSWORD_MAX_LENGTH,
} from '#services/password_strength'

/**
 * Shared rules for email and password.
 */
const email = () => vine.string().email().maxLength(254)

const passwordStrength = vine.createRule((value: unknown, _options, field) => {
  if (typeof value !== 'string') {
    return
  }

  if (!isStrongPassword(value)) {
    field.report('密码强度不足，请使用更长且更难猜测的密码', 'password.strength', field)
  }
})

const strongPassword = () =>
  vine
    .string()
    .minLength(ADMIN_PASSWORD_MIN_LENGTH)
    .maxLength(PASSWORD_MAX_LENGTH)
    .use(passwordStrength())

/**
 * Validator to use before validating user credentials
 * during login
 */
export const loginValidator = vine.create({
  email: email(),
  password: vine.string(),
})

export const changePasswordValidator = vine.create({
  currentPassword: vine.string(),
  password: strongPassword(),
  passwordConfirmation: strongPassword().sameAs('password'),
})

export const twoFactorValidator = vine.create({
  password: vine.string(),
})

export const enableTwoFactorValidator = vine.create({
  secret: vine.string().trim().minLength(1),
  token: vine.string().trim().minLength(6).maxLength(8),
})

export const verifyTwoFactorValidator = vine.create({
  tempToken: vine.string().trim().minLength(1),
  code: vine.string().trim().minLength(6).maxLength(16),
})

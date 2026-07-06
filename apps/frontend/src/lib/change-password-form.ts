import { isStrongPassword } from '@/lib/password'

export type ChangePasswordValidationMessage = 'fill_all' | 'password_mismatch' | 'password_weak'

export function validatePasswordChange(values: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
  userInputs?: string[]
}) {
  if (!values.currentPassword || !values.newPassword || !values.confirmPassword) {
    return 'fill_all' satisfies ChangePasswordValidationMessage
  }

  if (values.newPassword !== values.confirmPassword) {
    return 'password_mismatch' satisfies ChangePasswordValidationMessage
  }

  if (!isStrongPassword(values.newPassword, values.userInputs ?? [])) {
    return 'password_weak' satisfies ChangePasswordValidationMessage
  }

  return null
}

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128
export const PASSWORD_MIN_SCORE = 3
export const ADMIN_PASSWORD_MIN_LENGTH = 15
const COMMON_PASSWORD_BLOCKLIST = new Set(
  [
    'admin',
    'admin123',
    'password',
    'password123',
    'password123!@#',
    'qwerty',
    'qwerty123',
    '123456',
    '12345678',
    'change_this_password',
  ].map((value) => value.toLowerCase())
)

export function passwordContext(values: Array<string | null | undefined> = []) {
  return [
    'api starter kit',
    'API Starter Kit',
    ...values
      .flatMap((value) => String(value ?? '').split(/[\s@._-]+/))
      .map((value) => value.trim())
      .filter(Boolean),
  ]
}

export function passwordComposition(password: string) {
  return {
    length: password.length >= ADMIN_PASSWORD_MIN_LENGTH,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z\d]/.test(password),
  }
}

export function hasRequiredPasswordComposition(password: string) {
  const composition = passwordComposition(password)
  return Object.values(composition).every(Boolean)
}

function normalizeComparable(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
}

function includesContextToken(password: string, userInputs: string[]) {
  const normalizedPassword = normalizeComparable(password)
  return userInputs.some((input) => {
    const normalizedInput = normalizeComparable(input)
    return normalizedInput.length >= 4 && normalizedPassword.includes(normalizedInput)
  })
}

export function isStrongPassword(password: string, userInputs: string[] = []) {
  if (COMMON_PASSWORD_BLOCKLIST.has(password.trim().toLowerCase())) {
    return false
  }

  if (includesContextToken(password, userInputs)) {
    return false
  }

  if (!hasRequiredPasswordComposition(password)) {
    return false
  }

  return true
}

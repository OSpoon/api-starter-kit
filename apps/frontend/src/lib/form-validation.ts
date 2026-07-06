export function firstFormError(
  errors: Partial<Record<string, string | undefined>>,
  fallback: string
) {
  for (const message of Object.values(errors)) {
    if (message) {
      return message
    }
  }

  return fallback
}

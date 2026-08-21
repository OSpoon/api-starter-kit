export const queryResultLimit = 20

export function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!domain) return '[redacted]'
  return `${local.slice(0, 1)}***@${domain}`
}

export function maskName(name: string) {
  return name.length <= 1 ? '*' : `${name.slice(0, 1)}*`
}

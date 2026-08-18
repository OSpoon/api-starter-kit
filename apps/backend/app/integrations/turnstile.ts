import env from '#start/env'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export function isTurnstileEnabled() {
  return env.get('TURNSTILE_ENABLED') === true && Boolean(env.get('TURNSTILE_SECRET_KEY'))
}

export async function verifyTurnstileToken(token: string, remoteIp?: string) {
  if (!isTurnstileEnabled()) {
    return true
  }

  const secret = env.get('TURNSTILE_SECRET_KEY')
  if (!secret) {
    return false
  }

  const body = new URLSearchParams({
    secret: secret.release(),
    response: token,
  })
  if (remoteIp) {
    body.set('remoteip', remoteIp)
  }

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!response.ok) {
      return false
    }

    const result = (await response.json()) as { success?: boolean }
    return result.success === true
  } catch {
    return false
  }
}

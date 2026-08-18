import crypto from 'node:crypto'

export function generateInitialPassword() {
  return `${crypto.randomBytes(8).toString('base64url')}aA1!`
}

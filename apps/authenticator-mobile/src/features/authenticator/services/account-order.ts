import type { TotpAccount } from './totp'

export type AccountSortMode = 'manual' | 'ascending' | 'descending'

export function orderAccounts(
  accounts: TotpAccount[],
  mode: AccountSortMode,
  locale: string
): TotpAccount[] {
  if (mode === 'manual') return accounts

  const direction = mode === 'ascending' ? 1 : -1
  return [...accounts].sort(
    (left, right) =>
      direction *
      (left.issuer.localeCompare(right.issuer, locale, { sensitivity: 'base' }) ||
        left.name.localeCompare(right.name, locale, { sensitivity: 'base' }))
  )
}

export function moveAccount(
  accounts: TotpAccount[],
  accountId: string,
  direction: -1 | 1
): TotpAccount[] {
  const index = accounts.findIndex((account) => account.id === accountId)
  const destination = index + direction
  if (index < 0 || destination < 0 || destination >= accounts.length) return accounts

  const nextAccounts = [...accounts]
  const [account] = nextAccounts.splice(index, 1)
  nextAccounts.splice(destination, 0, account!)
  return nextAccounts
}

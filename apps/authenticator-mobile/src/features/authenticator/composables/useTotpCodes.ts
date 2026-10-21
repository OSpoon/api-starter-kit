import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { ref, watch } from 'vue'

import { generateTotpCode } from '../services/totp'
import type { TotpAccount } from '../services/totp'

export function useTotpCodes(accounts: { value: TotpAccount[] }, onError: () => void) {
  const codes = ref<Record<string, string>>({})
  const now = ref(Date.now())
  const codeBuckets = new Map<string, number>()
  let refreshSequence = 0
  let hasReportedError = false

  async function refreshCodes(force = false): Promise<void> {
    const sequence = ++refreshSequence
    const timestamp = now.value
    const liveIds = new Set(accounts.value.map((account) => account.id))
    const nextCodes = { ...codes.value }
    for (const id of Object.keys(nextCodes)) {
      if (!liveIds.has(id)) {
        delete nextCodes[id]
        codeBuckets.delete(id)
      }
    }

    try {
      const updates = await Promise.all(
        accounts.value
          .filter((account) => {
            const bucket = Math.floor(timestamp / 1000 / account.period)
            return force || codeBuckets.get(account.id) !== bucket
          })
          .map(async (account) => ({
            id: account.id,
            bucket: Math.floor(timestamp / 1000 / account.period),
            code: await generateTotpCode(account, timestamp),
          }))
      )
      if (sequence !== refreshSequence) return
      hasReportedError = false
      for (const update of updates) {
        nextCodes[update.id] = update.code
        codeBuckets.set(update.id, update.bucket)
      }
      codes.value = nextCodes
    } catch {
      if (sequence === refreshSequence && !hasReportedError) {
        hasReportedError = true
        onError()
      }
    }
  }

  function updateClock(): void {
    now.value = Date.now()
    void refreshCodes()
  }

  const visibility = useDocumentVisibility()
  const { pause, resume } = useIntervalFn(updateClock, 1000, { immediate: false })
  watch(
    visibility,
    (state) => {
      if (state === 'visible') {
        updateClock()
        resume()
      } else pause()
    },
    { immediate: true }
  )

  return { codes, now, refreshCodes }
}

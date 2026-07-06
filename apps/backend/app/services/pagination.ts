export function clampLimit(value: unknown, fallback = 50, max = 200) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(Math.max(Math.floor(parsed), 1), max)
}

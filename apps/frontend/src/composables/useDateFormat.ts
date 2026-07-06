import { formatDateOnly, formatDateTime, formatDateValue } from '@/lib/format'

export function useDateFormat() {
  return {
    formatDate: formatDateValue,
    formatDateOnly,
    formatDateTime,
  }
}

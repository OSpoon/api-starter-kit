type DateFormatStyle = 'date' | 'datetime' | 'short' | 'detailed'

const DATE_FORMATS: Record<DateFormatStyle, Intl.DateTimeFormatOptions> = {
  date: {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  },
  datetime: {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  },
  short: {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  },
  detailed: {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  },
}

export function formatDateValue(
  value: string | null | undefined,
  style: DateFormatStyle = 'short',
  empty = '-'
) {
  if (!value) {
    return empty
  }

  return new Intl.DateTimeFormat(undefined, DATE_FORMATS[style]).format(new Date(value))
}

/** Short month/day + time. */
export function formatDate(value: string | null | undefined) {
  return formatDateValue(value, 'short')
}

export function formatDateOnly(value: string | null | undefined) {
  return formatDateValue(value, 'date')
}

export function formatDateTime(value: string | null | undefined, empty = '-') {
  return formatDateValue(value, 'datetime', empty)
}

export function formatDateTimeDetailed(value: string | null | undefined, empty = '-') {
  return formatDateValue(value, 'detailed', empty)
}

import { format } from 'sql-formatter'

type FormatRequest = { dialect: 'GenericSQL' | 'MySQL' | 'PostgreSQL'; sql: string }

const languageByDialect = {
  GenericSQL: 'sql',
  MySQL: 'mysql',
  PostgreSQL: 'postgresql',
} as const

self.onmessage = ({ data }: MessageEvent<FormatRequest>) => {
  try {
    self.postMessage({ sql: format(data.sql, { language: languageByDialect[data.dialect] }) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Unable to format SQL.' })
  }
}

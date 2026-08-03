/// <reference lib="webworker" />

export type ValidationError = {
  message: string
  startLine?: number
  startCol?: number
  endLine?: number
  endCol?: number
}

type SqlParser = { validate: (sql: string) => ValidationError[] }
type ValidationRequest = { id: number; sql: string }

export function installValidator(createParser: () => SqlParser) {
  const parser = createParser()
  self.onmessage = ({ data }: MessageEvent<ValidationRequest>) => {
    try {
      const reportError = console.error
      try {
        // dt-sql-parser reports expected syntax errors through console.error as well as its
        // validation result. Diagnostics belong in Monaco, not the browser console.
        console.error = () => undefined
        self.postMessage({ id: data.id, errors: parser.validate(data.sql) })
      } finally {
        console.error = reportError
      }
    } catch {
      self.postMessage({
        id: data.id,
        errors: [{ message: 'Unable to validate the SQL document.' }],
      })
    }
  }
}

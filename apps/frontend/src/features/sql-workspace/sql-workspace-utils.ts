import type { DialectSelection, SqlDialect, TreeNode, WorkspaceFile } from './types'

const DIALECT_SAMPLE_SIZE = 256 * 1024

export const DIALECT_OPTIONS: DialectSelection[] = ['auto', 'PostgreSQL', 'MySQL']

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function dialectSample(sql: string) {
  if (sql.length <= DIALECT_SAMPLE_SIZE * 2) return sql
  return `${sql.slice(0, DIALECT_SAMPLE_SIZE)}\n${sql.slice(-DIALECT_SAMPLE_SIZE)}`
}

function stripCommentsAndStrings(sql: string) {
  let sanitized = ''
  let index = 0
  let state:
    | 'block-comment'
    | 'dollar-quote'
    | 'double-quote'
    | 'line-comment'
    | 'single-quote'
    | undefined
  let dollarQuoteDelimiter: string | undefined
  while (index < sql.length) {
    const current = sql[index]
    const next = sql[index + 1]
    if (state === 'line-comment') {
      if (current === '\n') {
        state = undefined
        sanitized += current
      } else sanitized += ' '
      index += 1
      continue
    }
    if (state === 'block-comment') {
      if (current === '*' && next === '/') {
        state = undefined
        sanitized += '  '
        index += 2
      } else {
        sanitized += current === '\n' ? '\n' : ' '
        index += 1
      }
      continue
    }
    if (state === 'dollar-quote' && dollarQuoteDelimiter) {
      if (sql.startsWith(dollarQuoteDelimiter, index)) {
        sanitized += dollarQuoteDelimiter
        index += dollarQuoteDelimiter.length
        dollarQuoteDelimiter = undefined
        state = undefined
      } else {
        sanitized += current === '\n' ? '\n' : ' '
        index += 1
      }
      continue
    }
    if (state === 'single-quote' || state === 'double-quote') {
      const terminator = state === 'single-quote' ? "'" : '"'
      if (current === terminator && next === current) {
        sanitized += '  '
        index += 2
      } else if (current === terminator) {
        state = undefined
        sanitized += ' '
        index += 1
      } else {
        sanitized += current === '\n' ? '\n' : ' '
        index += 1
      }
      continue
    }
    if (current === '-' && next === '-') {
      state = 'line-comment'
      sanitized += '  '
      index += 2
    } else if (current === '/' && next === '*') {
      state = 'block-comment'
      sanitized += '  '
      index += 2
    } else if (current === "'") {
      state = 'single-quote'
      sanitized += ' '
      index += 1
    } else if (current === '"') {
      state = 'double-quote'
      sanitized += ' '
      index += 1
    } else if (current === '$') {
      const delimiter = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]
      if (delimiter) {
        state = 'dollar-quote'
        dollarQuoteDelimiter = delimiter
        sanitized += delimiter
        index += delimiter.length
      } else {
        sanitized += current
        index += 1
      }
    } else {
      sanitized += current
      index += 1
    }
  }
  return sanitized
}

function signatureScore(sql: string, signatures: Array<[RegExp, number]>) {
  return signatures.reduce(
    (score, [signature, weight]) => score + (signature.test(sql) ? weight : 0),
    0
  )
}

export function detectDialect(sql: string): SqlDialect {
  const normalized = stripCommentsAndStrings(dialectSample(sql)).toUpperCase()
  const mysqlScore = signatureScore(normalized, [
    [/\bAUTO_INCREMENT\b/, 6],
    [/\bON\s+DUPLICATE\s+KEY\b/, 6],
    [/\bENGINE\s*=\s*\w+\b/, 5],
    [/\bSQL_CALC_FOUND_ROWS\b/, 5],
    [/\bDELIMITER\s+\S+/, 4],
    [/\bUNSIGNED\b/, 2],
    [/`[^`]+`/, 1],
  ])
  const postgresqlScore = signatureScore(normalized, [
    [/\bBIGSERIAL\b|\bSMALLSERIAL\b|\bSERIAL\b/, 6],
    [/\bILIKE\b/, 6],
    [/\bJSONB\b/, 5],
    [/\bON\s+CONFLICT\b/, 5],
    [/\bGENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/, 5],
    [/::\s*[A-Z_][A-Z0-9_]*/, 4],
    [/\$[A-Z_][A-Z0-9_]*\$|\$\$/, 3],
    [/\bRETURNING\b/, 1],
  ])

  if (mysqlScore >= 3 && mysqlScore > postgresqlScore) return 'MySQL'
  if (postgresqlScore >= 3 && postgresqlScore > mysqlScore) return 'PostgreSQL'
  return 'GenericSQL'
}

export function buildTree(workspaceFiles: WorkspaceFile[]) {
  const root: TreeNode[] = []
  for (const file of workspaceFiles) {
    const parts = file.path.split('/')
    let level = root
    let currentPath = ''
    for (const [index, part] of parts.entries()) {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const directory = index < parts.length - 1
      let node = level.find((candidate) => candidate.name === part)
      if (!node) {
        node = { name: part, path: currentPath, directory, children: [] }
        level.push(node)
      }
      if (!directory) node.file = file
      level = node.children
    }
  }
  const sortNodes = (nodes: TreeNode[]) =>
    nodes.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name))
  const sortRecursively = (nodes: TreeNode[]) =>
    nodes.forEach((node) => {
      sortNodes(node.children)
      sortRecursively(node.children)
    })
  sortNodes(root)
  sortRecursively(root)
  return root
}

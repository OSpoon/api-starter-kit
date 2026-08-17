export type SqlDialect = 'GenericSQL' | 'MySQL' | 'PostgreSQL'

export type DialectSelection = 'auto' | Exclude<SqlDialect, 'GenericSQL'>

export type WorkspaceFile = { path: string; content: string; savedContent: string }

export type TreeNode = {
  name: string
  path: string
  directory: boolean
  children: TreeNode[]
  file?: WorkspaceFile
}

export type ValidationError = {
  message: string
  startLine?: number
  startCol?: number
  endLine?: number
  endCol?: number
}

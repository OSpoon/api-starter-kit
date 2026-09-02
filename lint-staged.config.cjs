const fs = require('node:fs')

function quotePath(path) {
  return `"${path.replaceAll('"', '\\"')}"`
}

function isScopedCodeFile(file) {
  return file.startsWith('apps/backend/') && file.endsWith('.ts')
    || file.startsWith('apps/frontend/') && /\.(ts|vue)$/.test(file)
}

function formatFiles(files) {
  const existingFiles = files.filter((file) => !isScopedCodeFile(file) && fs.existsSync(file))
  if (!existingFiles.length) {
    return []
  }

  const paths = existingFiles.map(quotePath).join(' ')
  return `prettier --write --config prettier.config.cjs --ignore-path .prettierignore ${paths}`
}

function formatAndCheckScopedFiles(files, packageDir) {
  const existingFiles = files.filter((file) => fs.existsSync(file))
  if (!existingFiles.length) {
    return []
  }

  const paths = existingFiles.map(quotePath).join(' ')
  return [
    `prettier --write --config prettier.config.cjs --ignore-path .prettierignore ${paths}`,
    `pnpm --dir ${packageDir} lint`,
    `pnpm --dir ${packageDir} typecheck`,
  ]
}

module.exports = {
  '*.{js,ts,vue,json,css,md,yml,yaml}': formatFiles,
  'apps/frontend/**/*.{ts,vue}': (files) => formatAndCheckScopedFiles(files, 'apps/frontend'),
  'apps/backend/**/*.ts': (files) => formatAndCheckScopedFiles(files, 'apps/backend'),
}

const fs = require('node:fs')

function quotePath(path) {
  return `"${path.replaceAll('"', '\\"')}"`
}

function formatFiles(files) {
  const existingFiles = files.filter((file) => fs.existsSync(file))
  if (!existingFiles.length) {
    return []
  }

  const paths = existingFiles.map(quotePath).join(' ')
  return `prettier --write --config prettier.config.cjs --ignore-path .prettierignore ${paths}`
}

module.exports = {
  '*.{js,ts,vue,json,css,md,yml,yaml}': formatFiles,
  'apps/frontend/**/*.{ts,vue}': () => [
    'pnpm --dir apps/frontend lint',
    'pnpm --dir apps/frontend typecheck',
  ],
  'apps/backend/**/*.ts': () => [
    'pnpm --dir apps/backend lint',
    'pnpm --dir apps/backend typecheck',
  ],
}

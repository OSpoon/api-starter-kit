import { defineConfig } from 'bumpp'

export default defineConfig({
  recursive: true,
  commit: 'chore: release v%s',
  tag: 'v%s',
  push: true,
  install: true,
  all: true,
})

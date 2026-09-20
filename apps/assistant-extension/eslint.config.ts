import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from 'eslint-config-prettier/flat'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tailwindcss from 'eslint-plugin-tailwindcss'
import unusedImports from 'eslint-plugin-unused-imports'
import pluginVue from 'eslint-plugin-vue'
import { fileURLToPath, URL } from 'node:url'

const sharedCss = fileURLToPath(new URL('../frontend/src/assets/main.css', import.meta.url))

export default defineConfigWithVueTs(
  {
    name: 'assistant-extension/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },
  globalIgnores([
    '**/dist/**',
    '**/coverage/**',
    '**/extension-env.d.ts',
    '**/src/auto-imports.d.ts',
    '**/src/components.d.ts',
  ]),
  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    name: 'assistant-extension/tsconfig-root-dir',
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    name: 'assistant-extension/tailwind',
    files: ['src/**/*.{vue,ts,mts,tsx}'],
    plugins: { tailwindcss },
    settings: {
      tailwindcss: {
        cssConfigPath: sharedCss,
      },
    },
    rules: {
      'tailwindcss/classnames-order': 'warn',
      'tailwindcss/enforces-shorthand': 'warn',
      'tailwindcss/no-contradicting-classname': 'error',
      'tailwindcss/no-unnecessary-arbitrary-value': 'warn',
    },
  },
  {
    name: 'assistant-extension/unused-imports',
    plugins: { 'unused-imports': unusedImports },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    name: 'assistant-extension/import-sort',
    files: ['src/**/*.{vue,ts,mts,tsx}'],
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^\u0000'], ['^node:'], ['^@?\w'], ['^@/'], ['^\.']],
        },
      ],
      'simple-import-sort/exports': 'error',
    },
  },
  skipFormatting
)

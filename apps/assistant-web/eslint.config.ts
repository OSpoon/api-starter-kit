import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import tailwindcss from 'eslint-plugin-tailwindcss'
import pluginVue from 'eslint-plugin-vue'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import skipFormatting from 'eslint-config-prettier/flat'
import unusedImports from 'eslint-plugin-unused-imports'

export default defineConfigWithVueTs(
  {
    name: 'assistant/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },
  globalIgnores(['**/dist/**', '**/coverage/**']),
  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    name: 'assistant/tsconfig-root-dir',
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    name: 'assistant/tailwind',
    files: ['src/**/*.{vue,ts,mts,tsx}'],
    plugins: { tailwindcss },
    settings: {
      tailwindcss: {
        cssConfigPath: './src/assets/main.css',
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
    name: 'assistant/unused-imports',
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
    name: 'assistant/import-sort',
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

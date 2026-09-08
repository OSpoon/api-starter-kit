import { globalIgnores } from 'eslint/config'
import { configApp } from '@adonisjs/eslint-config'
import simpleImportSort from 'eslint-plugin-simple-import-sort'

export default [
  // Lucid regenerates this file from the database and does not use the
  // repository Prettier print width. TypeScript still type-checks it.
  globalIgnores(['.adonisjs/**', 'build/**', 'database/schema.ts']),
  ...configApp(),
  {
    name: 'app/tsconfig-root-dir',
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    name: 'app/import-sort',
    files: ['**/*.ts'],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^\\u0000'], ['^node:'], ['^@?\\w'], ['^#'], ['^\\.']],
        },
      ],
      'simple-import-sort/exports': 'error',
    },
  },
]

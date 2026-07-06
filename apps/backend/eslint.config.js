import { globalIgnores } from 'eslint/config'
import { configApp } from '@adonisjs/eslint-config'
import simpleImportSort from 'eslint-plugin-simple-import-sort'

export default [
  globalIgnores(['.adonisjs/**', 'build/**']),
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

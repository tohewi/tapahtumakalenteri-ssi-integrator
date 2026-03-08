import js from '@eslint/js'
import architectural from '../.eslintrc-architectural.js'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      // Enable architectural rules
      'no-cross-domain-imports': 'error',
      'no-barrel-imports': 'error',
      'no-direct-client-imports': 'error',
      
      // Recommended rules for maintainability
      'no-console': 'off', // Console logging is used for server logs
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
    },
  },
  {
    plugins: {
      architectural: architectural,
    },
  },
]

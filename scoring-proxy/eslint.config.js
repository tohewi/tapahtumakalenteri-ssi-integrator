import js from '@eslint/js'
import globals from 'globals'
import { defineConfig } from 'eslint/config'

const architecturePlugin = {
  rules: {
    'no-cross-domain-imports': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow cross-domain imports in ssi-core modules',
        },
        schema: [],
        messages: {
          noCrossDomain:
            'Cross-domain imports are not allowed in ssi-core domain modules. Import only from http-helpers.js or constants.js.',
        },
      },
      create(context) {
        const filename = (context.filename || '').replace(/\\/g, '/')
        if (
          !filename.includes('lib/ssi-core/') ||
          filename.endsWith('/http-helpers.js') ||
          filename.endsWith('/index.js') ||
          filename.endsWith('/client.js')
        ) {
          return {}
        }

        const domainModules = ['graphql.js', 'scoring.js', 'participants.js', 'management.js']
        return {
          ImportDeclaration(node) {
            const source = node.source.value
            if (source.startsWith('./') || source.startsWith('../')) {
              const importedFile = source.replace(/^\.\//, '').replace(/^\.\.\//g, '')
              if (domainModules.some(m => importedFile === m || importedFile.endsWith('/' + m))) {
                context.report({ node, messageId: 'noCrossDomain' })
              }
            }
          },
        }
      },
    },
    'no-barrel-imports': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow barrel imports from ssi-core/index.js in routes and services',
        },
        schema: [],
        messages: {
          noBarrelImport:
            'Barrel imports from ssi-core/index.js create hidden dependencies. Import from specific domain modules instead.',
        },
      },
      create(context) {
        const filename = (context.filename || '').replace(/\\/g, '/')
        if (!filename.includes('/routes/') && !filename.includes('/lib/services/')) {
          return {}
        }
        return {
          ImportDeclaration(node) {
            const source = node.source.value
            if (
              source.endsWith('ssi-core/index.js') ||
              source.endsWith('ssi-core') ||
              source.endsWith('ssi-core/')
            ) {
              context.report({ node, messageId: 'noBarrelImport' })
            }
          },
        }
      },
    },
  },
}

export default defineConfig([
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    plugins: {
      architecture: architecturePlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      'architecture/no-cross-domain-imports': 'error',
      'architecture/no-barrel-imports': 'error',
    },
  },
])

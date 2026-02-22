/**
 * ESLint plugin for enforcing architectural rules
 * Prevents architectural drift by enforcing module boundaries
 */

module.exports = {
  rules: {
    'no-cross-domain-imports': {
      meta: {
        type: 'error',
        docs: {
          description: 'Disallow cross-domain imports in ssi-core modules',
          category: 'Best Practices',
          recommended: true,
        },
        fixable: null,
        schema: [],
        messages: {
          noCrossDomain: 'Cross-domain imports are not allowed in ssi-core modules. Import only from http-helpers.js within ssi-core.',
        },
      },
      create(context) {
        const filename = context.getFilename()
        
        // Only apply to ssi-core domain modules
        if (!filename.includes('lib/ssi-core/') || filename.includes('http-helpers.js')) {
          return {}
        }
        
        return {
          ImportDeclaration(node) {
            const source = node.source.value
            
            // Allow relative imports within ssi-core
            if (source.startsWith('./') || source.startsWith('../')) {
              // Check if it's importing from another domain module
              const importedFile = source.replace(/^\.\//, '').replace(/^\.\.\//g, '')
              const domainModules = ['graphql.js', 'scoring.js', 'participants.js', 'management.js']
              
              if (domainModules.some(module => importedFile === module || importedFile.endsWith('/' + module))) {
                context.report({
                  node,
                  messageId: 'noCrossDomain',
                })
              }
            }
          },
        }
      },
    },
    
    'no-barrel-imports': {
      meta: {
        type: 'error',
        docs: {
          description: 'Disallow barrel imports that create hidden dependencies',
          category: 'Best Practices',
          recommended: true,
        },
        fixable: null,
        schema: [],
        messages: {
          noBarrelImport: 'Barrel imports create hidden dependencies. Import from specific domain modules instead.',
        },
      },
      create(context) {
        return {
          ImportDeclaration(node) {
            const source = node.source.value
            
            // Disallow importing from index.js barrel files
            if (source.endsWith('/index.js') || source === '../lib/ssi-core') {
              context.report({
                node,
                messageId: 'noBarrelImport',
              })
            }
          },
        }
      },
    },
  },
}

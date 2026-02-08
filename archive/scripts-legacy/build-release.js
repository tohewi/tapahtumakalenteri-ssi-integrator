/**
 * Build release script
 * 
 * Runs: tests → npm audit (both projects) → vite build → generates scan report
 * Usage: node scripts/build-release.js
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const uiDir = resolve(root, 'scoring-ui')
const proxyDir = resolve(root, 'scoring-proxy')

function run(cmd, cwd) {
  console.log(`\n▶ ${cmd}`)
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: 'pipe' })
}

function runSafe(cmd, cwd) {
  try { return run(cmd, cwd) } catch (e) { return e.stdout || e.stderr || e.message }
}

const pkg = JSON.parse(readFileSync(resolve(uiDir, 'package.json'), 'utf-8'))
const version = pkg.version
const buildTime = new Date().toISOString()
const nodeVersion = run('node --version', root).trim()
const npmVersion = run('npm --version', root).trim()

console.log(`\n========================================`)
console.log(`  SSI Scoring — Build v${version}`)
console.log(`  ${buildTime}`)
console.log(`  Node ${nodeVersion} / npm ${npmVersion}`)
console.log(`========================================\n`)

// 1. Tests
console.log('\n── STEP 1: Running tests ──')
try {
  const testOutput = run('npm test', uiDir)
  const testMatch = testOutput.match(/Tests\s+(\d+)\s+passed/)
  console.log(`✅ Tests: ${testMatch ? testMatch[1] + ' passed' : 'passed'}`)
} catch (e) {
  console.error('❌ Tests FAILED')
  console.error(e.stdout || e.stderr)
  process.exit(1)
}

// 2. Vulnerability scan
console.log('\n── STEP 2: Vulnerability scan ──')

const auditUi = JSON.parse(runSafe('npm audit --json', uiDir))
const auditProxy = JSON.parse(runSafe('npm audit --json', proxyDir))

const uiVulns = auditUi.metadata?.vulnerabilities || {}
const proxyVulns = auditProxy.metadata?.vulnerabilities || {}
const uiTotal = uiVulns.total || 0
const proxyTotal = proxyVulns.total || 0

console.log(`  scoring-ui:    ${uiTotal === 0 ? '✅ 0 vulnerabilities' : `⚠️  ${uiTotal} vulnerabilities`}`)
console.log(`  scoring-proxy: ${proxyTotal === 0 ? '✅ 0 vulnerabilities' : `⚠️  ${proxyTotal} vulnerabilities`}`)

if (uiTotal > 0 || proxyTotal > 0) {
  console.log('\n  Vulnerability details:')
  if (uiTotal > 0) console.log(`  UI: info=${uiVulns.info} low=${uiVulns.low} moderate=${uiVulns.moderate} high=${uiVulns.high} critical=${uiVulns.critical}`)
  if (proxyTotal > 0) console.log(`  Proxy: info=${proxyVulns.info} low=${proxyVulns.low} moderate=${proxyVulns.moderate} high=${proxyVulns.high} critical=${proxyVulns.critical}`)
}

// 3. Build
console.log('\n── STEP 3: Building UI ──')
try {
  run('npm run build', uiDir)
  console.log('✅ Build succeeded')
} catch (e) {
  console.error('❌ Build FAILED')
  console.error(e.stdout || e.stderr)
  process.exit(1)
}

// 4. Generate scan report
console.log('\n── STEP 4: Generating scan report ──')

const uiDeps = JSON.parse(runSafe('npm ls --json', uiDir))
const proxyDeps = JSON.parse(runSafe('npm ls --json', proxyDir))
const uiDepCount = auditUi.metadata?.dependencies?.total || '?'
const proxyDepCount = auditProxy.metadata?.dependencies?.total || '?'

const report = `# Build Scan Report — v${version}

**Build time**: ${buildTime}
**Node.js**: ${nodeVersion}
**npm**: ${npmVersion}

## npm Audit

| Project | Dependencies | Vulnerabilities | Status |
|---|---|---|---|
| scoring-ui | ${uiDepCount} | ${uiTotal} | ${uiTotal === 0 ? '✅ Clean' : '⚠️ Review needed'} |
| scoring-proxy | ${proxyDepCount} | ${proxyTotal} | ${proxyTotal === 0 ? '✅ Clean' : '⚠️ Review needed'} |

${uiTotal > 0 ? `### scoring-ui vulnerabilities\ninfo: ${uiVulns.info}, low: ${uiVulns.low}, moderate: ${uiVulns.moderate}, high: ${uiVulns.high}, critical: ${uiVulns.critical}\n` : ''}
${proxyTotal > 0 ? `### scoring-proxy vulnerabilities\ninfo: ${proxyVulns.info}, low: ${proxyVulns.low}, moderate: ${proxyVulns.moderate}, high: ${proxyVulns.high}, critical: ${proxyVulns.critical}\n` : ''}
## Tests

All tests passed.
`

const reportPath = resolve(root, 'docs', `build-scan-v${version}.md`)
writeFileSync(reportPath, report)
console.log(`✅ Scan report: docs/build-scan-v${version}.md`)

// 5. Summary
console.log(`\n========================================`)
console.log(`  ✅ Build v${version} complete`)
console.log(`  Vulnerabilities: ${uiTotal + proxyTotal}`)
console.log(`  Report: docs/build-scan-v${version}.md`)
console.log(`========================================\n`)

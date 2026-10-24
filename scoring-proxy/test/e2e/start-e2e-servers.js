// ============================================================
// Starts Mock SSI Upstream (4101) + Scoring Proxy (3099) for E2E
// ============================================================

import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startMockSsiServer } from './mock-ssi-server.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const proxyDir = resolve(__dirname, '../..')
const e2eGunFile = resolve(proxyDir, 'data', 'e2e-gun-inventory.json')
rmSync(e2eGunFile, { force: true })

const mockPort = Number(process.env.MOCK_SSI_PORT || 4101)
const proxyPort = Number(process.env.E2E_PROXY_PORT || 3099)

await startMockSsiServer(mockPort)
console.log(`[e2e] Mock SSI listening on http://127.0.0.1:${mockPort}`)

const child = spawn(process.execPath, ['server.js'], {
  cwd: proxyDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(proxyPort),
    SSI_BASE_URL: `http://127.0.0.1:${mockPort}`,
    SSI_ADMIN_EMAIL: 'admin@example.com',
    SSI_ADMIN_PASSWORD: 'admin-password',
    SSI_ADMIN_API_KEY: 'mock-admin-api-key',
    SESSION_SECRET: 'e2e-test-session-secret-key-0123456789',
    GUN_INVENTORY_FILE_PATH: e2eGunFile,
  },
})

process.on('SIGTERM', () => child.kill('SIGTERM'))
process.on('SIGINT', () => child.kill('SIGINT'))

// ============================================================
// Tier 2 UAT: Post-Deploy Render PR Preview Smoke Verifier (R90-TEST9)
// ============================================================

export async function verifyPreviewDeployment({
  baseUrl,
  maxAttempts = 12,
  delayMs = 5000,
  fetchImpl = globalThis.fetch,
} = {}) {
  const cleanBase = String(baseUrl || process.env.PREVIEW_URL || '').replace(/\/+$/, '')
  if (!cleanBase) {
    throw new Error('baseUrl or PREVIEW_URL is required')
  }

  let lastError = 'Unknown error'
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const healthResp = await fetchImpl(`${cleanBase}/api/v1/health`)
      if (!healthResp.ok) {
        throw new Error(`/api/v1/health returned HTTP ${healthResp.status}`)
      }
      const healthData = await healthResp.json()
      if (healthData?.status !== 'ok') {
        throw new Error(`/api/v1/health payload status=${healthData?.status}`)
      }

      const rootResp = await fetchImpl(`${cleanBase}/`)
      if (!rootResp.ok) {
        throw new Error(`/ returned HTTP ${rootResp.status}`)
      }
      const html = await rootResp.text()
      if (!html.includes('id="root"')) {
        throw new Error('SPA root <div id="root"> not found in index HTML')
      }

      return {
        ok: true,
        attempts: attempt,
        baseUrl: cleanBase,
        health: healthData,
      }
    } catch (err) {
      lastError = err.message
      if (attempt < maxAttempts && delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs))
      }
    }
  }

  return {
    ok: false,
    attempts: maxAttempts,
    baseUrl: cleanBase,
    error: lastError,
  }
}

if (process.argv[1] && process.argv[1].endsWith('verify-preview-deploy.js')) {
  verifyPreviewDeployment({
    baseUrl: process.env.PREVIEW_URL || process.argv[2],
    maxAttempts: Number(process.env.PREVIEW_MAX_ATTEMPTS || 12),
    delayMs: Number(process.env.PREVIEW_DELAY_MS || 5000),
  }).then(res => {
    console.log(JSON.stringify(res))
    process.exit(res.ok ? 0 : 1)
  })
}

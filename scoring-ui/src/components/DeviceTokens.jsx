// ============================================================
// DeviceTokens — QR Code Login Management (R7.7)
//
// Manage page section for creating, viewing, and revoking
// device tokens that enable QR code login for scoring devices.
//
// Raw tokens are stored encrypted server-side and returned
// by the list API, so QR codes work from any device/browser.
// ============================================================

import { useState, useEffect } from 'react'
import QRCode from 'qrcode'

const API_BASE = '/api/v1'

async function apiFetch(path, opts = {}) {
  const resp = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
  return data
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('fi-FI', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function daysUntil(ts) {
  if (!ts) return null
  const diff = ts - Date.now()
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
}

// --- Generate QR data URLs for a raw token ---
async function generateQrCodes(rawToken) {
  const host = window.location.origin
  const mobileUrl = `${host}/#/scoring?token=${rawToken}`
  const tabletUrl = `${host}/#/scoring-tablet?token=${rawToken}`
  const [mobileQr, tabletQr] = await Promise.all([
    QRCode.toDataURL(mobileUrl, { width: 300, margin: 2 }),
    QRCode.toDataURL(tabletUrl, { width: 300, margin: 2 }),
  ])
  return { mobileQr, tabletQr, mobileUrl, tabletUrl }
}

// --- Print QR codes for a token ---
// Escape HTML to prevent XSS in print window
function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function printQrCodes({ label, mobileQr, tabletQr }) {
  const win = window.open('', '_blank', 'width=700,height=500')
  if (!win) return // popup blocked
  win.document.write(`
    <html><head><title>QR Login — ${label}</title>
    <style>body{font-family:Arial,sans-serif;text-align:center;padding:20px}
    h2{margin:0 0 5px}p{color:#666;margin:5px 0}
    .codes{display:flex;justify-content:center;gap:40px;margin:20px 0}
    .code-box{text-align:center}
    .code-box img{margin:10px 0}
    .code-label{font-size:14px;font-weight:bold;color:#333}
    .hint{font-size:12px;color:#999}</style></head><body>
    <h2>${escapeHtml(label)}</h2>
    <p>Skannaa QR-koodi laitteella</p>
    <div class="codes">
      <div class="code-box">
        <div class="code-label">📱 Puhelin</div>
        <img src="${mobileQr}" width="200" height="200" />
      </div>
      <div class="code-box">
        <div class="code-label">📋 Tabletti</div>
        <img src="${tabletQr}" width="200" height="200" />
      </div>
    </div>
    <p class="hint">Token expires in 5 days</p>
    </body></html>
  `)
  win.document.close()
  setTimeout(() => win.print(), 250)
}

// --- Token card with inline QR codes ---
function TokenCard({ token, qrData, onRevoke, onPrint }) {
  const days = daysUntil(token.expiresAt)
  return (
    <div className="bg-gray-50 border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-gray-900">{token.label}</div>
          <div className="text-xs text-gray-400">
            {token.ssiEmail} · Luotu {formatDate(token.createdAt)}
            {token.lastUsedAt && ` · Käytetty ${formatDate(token.lastUsedAt)}`}
            {days !== null && (
              <span className={days < 2 ? 'text-amber-600' : ''}> · {days}pv jäljellä</span>
            )}
          </div>
        </div>
        <button onClick={() => onRevoke(token.tokenId, token.label)}
          className="text-xs text-red-500 hover:text-red-700 shrink-0">
          Peruuta
        </button>
      </div>
      {qrData ? (
        <div className="mt-2">
          <div className="flex justify-center gap-6">
            <div className="text-center">
              <div className="text-xs font-semibold text-gray-600 mb-1">📱 Puhelin</div>
              <img src={qrData.mobileQr} alt="Mobile QR" style={{ width: 160, height: 160 }} />
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold text-gray-600 mb-1">📋 Tabletti</div>
              <img src={qrData.tabletQr} alt="Tablet QR" style={{ width: 160, height: 160 }} />
            </div>
          </div>
          <div className="flex justify-center mt-2">
            <button onClick={() => onPrint({ label: token.label, ...qrData })}
              className="text-xs bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700">
              🖨️ Tulosta
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-400 mt-1 italic">
          QR-koodit eivät ole saatavilla (luotu toisella laitteella)
        </div>
      )}
    </div>
  )
}

export default function DeviceTokens() {
  const [tokens, setTokens] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ssiEmail: '', ssiPassword: '', label: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  // Map of tokenId → { mobileQr, tabletQr, mobileUrl, tabletUrl }
  const [qrCache, setQrCache] = useState({})

  async function loadTokens() {
    try {
      const data = await apiFetch('/auth/device-tokens')
      const list = data.tokens || []
      setTokens(list)

      // Generate QR codes from server-returned raw tokens
      const newCache = {}
      await Promise.all(list.map(async (t) => {
        if (t.token) {
          newCache[t.tokenId] = await generateQrCodes(t.token)
        }
      }))
      setQrCache(newCache)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  useEffect(() => { loadTokens() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.ssiEmail || !form.ssiPassword || !form.label.trim()) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const data = await apiFetch('/auth/device-tokens', {
        method: 'POST',
        body: JSON.stringify({
          ssiEmail: form.ssiEmail.trim(),
          ssiPassword: form.ssiPassword,
          label: form.label.trim(),
        }),
      })

      setSuccess(`Token created for "${form.label.trim()}"`)
      setForm({ ssiEmail: '', ssiPassword: '', label: '' })
      setShowForm(false)
      await loadTokens()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke(tokenId, label) {
    if (!confirm(`Peruuta tunniste "${label}"? Laite tarvitsee uuden QR-koodin kirjautuakseen.`)) return
    try {
      await apiFetch(`/auth/device-tokens/${tokenId}`, { method: 'DELETE' })
      setSuccess(`Tunniste "${label}" peruutettu`)
      await loadTokens()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="bg-white rounded-lg border p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-gray-800">QR-kirjautuminen</h3>
          <p className="text-xs text-gray-500">Luo QR-koodeja pistelaitteille</p>
        </div>
        {!showForm && (
          <button onClick={() => { setShowForm(true); setError(null); setSuccess(null) }}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700">
            + Luo QR-koodi
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-3">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm mb-3">{success}</div>}

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
          <div className="text-sm font-semibold text-gray-700">Uusi laitetunniste</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">SSI-sähköposti</label>
              <input type="email" value={form.ssiEmail} onChange={e => setForm(f => ({ ...f, ssiEmail: e.target.value }))}
                required placeholder="user@example.com"
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">SSI-salasana</label>
              <input type="password" value={form.ssiPassword} onChange={e => setForm(f => ({ ...f, ssiPassword: e.target.value }))}
                required autoComplete="new-password"
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Laitteen nimi</label>
              <input type="text" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                required placeholder="esim. Tabletti 1"
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:text-gray-700">Peruuta</button>
            <button type="submit" disabled={saving}
              className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Luodaan...' : 'Luo tunniste'}
            </button>
          </div>
        </form>
      )}

      {/* Active tokens list with inline QR codes */}
      {loading ? (
        <div className="text-sm text-gray-400">Ladataan...</div>
      ) : tokens.length === 0 ? (
        <div className="text-sm text-gray-400">Ei aktiivisia laitetunnisteita.</div>
      ) : (
        <div className="space-y-3">
          {tokens.map(t => (
            <TokenCard
              key={t.tokenId}
              token={t}
              qrData={qrCache[t.tokenId] || null}
              onRevoke={handleRevoke}
              onPrint={printQrCodes}
            />
          ))}
        </div>
      )}
    </div>
  )
}

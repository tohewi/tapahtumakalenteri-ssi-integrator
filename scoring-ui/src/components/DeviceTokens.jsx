// ============================================================
// DeviceTokens — QR Code Login Management (R7.7)
//
// Manage page section for creating, viewing, and revoking
// device tokens that enable QR code login for scoring devices.
// ============================================================

import { useState, useEffect, useRef } from 'react'
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
  return new Date(ts).toLocaleDateString('fi-FI', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function daysUntil(ts) {
  if (!ts) return null
  const diff = ts - Date.now()
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
}

export default function DeviceTokens() {
  const [tokens, setTokens] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ssiEmail: '', ssiPassword: '', label: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [newToken, setNewToken] = useState(null) // { tokenId, token, qrDataUrl }
  const qrRef = useRef(null)

  async function loadTokens() {
    try {
      const data = await apiFetch('/auth/device-tokens')
      setTokens(data.tokens || [])
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
    setNewToken(null)
    try {
      const data = await apiFetch('/auth/device-tokens', {
        method: 'POST',
        body: JSON.stringify({
          ssiEmail: form.ssiEmail.trim(),
          ssiPassword: form.ssiPassword,
          label: form.label.trim(),
        }),
      })

      // Generate QR code URL
      const host = window.location.origin
      const url = `${host}/#/scoring?token=${data.token}`
      const qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 })

      setNewToken({ tokenId: data.tokenId, token: data.token, qrDataUrl, url, label: form.label.trim() })
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
    if (!confirm(`Revoke token "${label}"? The device will need a new QR code to login.`)) return
    try {
      await apiFetch(`/auth/device-tokens/${tokenId}`, { method: 'DELETE' })
      setSuccess(`Token "${label}" revoked`)
      setNewToken(null)
      await loadTokens()
    } catch (err) {
      setError(err.message)
    }
  }

  function handlePrint() {
    if (!newToken?.qrDataUrl) return
    const win = window.open('', '_blank', 'width=400,height=500')
    win.document.write(`
      <html><head><title>QR Login — ${newToken.label}</title>
      <style>body{font-family:Arial,sans-serif;text-align:center;padding:20px}
      h2{margin:0 0 5px}p{color:#666;margin:5px 0}img{margin:20px 0}
      .label{font-size:24px;font-weight:bold;margin-top:10px}
      .hint{font-size:12px;color:#999}</style></head><body>
      <h2>Scan to Score</h2>
      <p>Skannaa aloittaaksesi pisteytyksen</p>
      <img src="${newToken.qrDataUrl}" width="250" height="250" />
      <div class="label">${newToken.label}</div>
      <p class="hint">Token expires in 5 days</p>
      </body></html>
    `)
    win.document.close()
    setTimeout(() => win.print(), 250)
  }

  return (
    <div className="bg-white rounded-lg border p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-gray-800">QR-kirjautuminen</h3>
          <p className="text-xs text-gray-500">Luo QR-koodeja pistelaitteille</p>
        </div>
        {!showForm && !newToken && (
          <button onClick={() => { setShowForm(true); setError(null); setSuccess(null) }}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700">
            + Luo QR-koodi
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-3">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm mb-3">{success}</div>}

      {/* New QR code display */}
      {newToken && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-center">
          <h4 className="font-bold text-blue-800 mb-1">{newToken.label}</h4>
          <p className="text-xs text-blue-600 mb-3">Skannaa tämä QR-koodi laitteella</p>
          <img src={newToken.qrDataUrl} alt="QR Code" className="mx-auto mb-3" style={{ width: 200, height: 200 }} />
          <div className="flex items-center justify-center gap-2">
            <button onClick={handlePrint} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700">
              🖨️ Tulosta
            </button>
            <button onClick={() => setNewToken(null)} className="text-sm text-gray-500 hover:text-gray-700">
              Sulje
            </button>
          </div>
          <p className="text-[10px] text-blue-400 mt-2 break-all">{newToken.url}</p>
        </div>
      )}

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

      {/* Active tokens list */}
      {loading ? (
        <div className="text-sm text-gray-400">Ladataan...</div>
      ) : tokens.length === 0 ? (
        <div className="text-sm text-gray-400">Ei aktiivisia laitetunnisteita.</div>
      ) : (
        <div className="space-y-2">
          {tokens.map(t => {
            const days = daysUntil(t.expiresAt)
            return (
              <div key={t.tokenId} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-gray-900">{t.label}</div>
                  <div className="text-xs text-gray-400">
                    {t.ssiEmail} · Luotu {formatDate(t.createdAt)}
                    {t.lastUsedAt && ` · Käytetty ${formatDate(t.lastUsedAt)}`}
                    {days !== null && (
                      <span className={days < 2 ? 'text-amber-600' : ''}> · {days}pv jäljellä</span>
                    )}
                  </div>
                </div>
                <button onClick={() => handleRevoke(t.tokenId, t.label)}
                  className="text-xs text-red-500 hover:text-red-700">
                  Peruuta
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

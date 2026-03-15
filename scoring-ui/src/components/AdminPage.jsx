// ============================================================
// Admin Dashboard Page (BL-1)
//
// Super-admin operational oversight dashboard.
// Requires ADMIN_API_KEY to access.
// Shows: tenants with owners, accounts, session stats.
// ============================================================

import { useState, useEffect } from 'react'

const API_BASE = '/api/v1/admin'

async function adminFetch(path, apiKey) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

async function adminDelete(path, apiKey) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export default function AdminPage() {
  const [apiKey, setApiKey] = useState(sessionStorage.getItem('admin_api_key') || '')
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [activeTab, setActiveTab] = useState('tenants')

  // Attempt to authenticate with stored key on mount
  useEffect(() => {
    if (apiKey && !authenticated) {
      handleLogin()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogin() {
    if (!apiKey.trim()) return
    setLoading(true)
    setError(null)
    try {
      const overview = await adminFetch('/overview', apiKey.trim())
      setData(overview)
      setAuthenticated(true)
      sessionStorage.setItem('admin_api_key', apiKey.trim())
    } catch (err) {
      setError(err.message)
      setAuthenticated(false)
      sessionStorage.removeItem('admin_api_key')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setLoading(true)
    setError(null)
    try {
      const overview = await adminFetch('/overview', apiKey.trim())
      setData(overview)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    setAuthenticated(false)
    setData(null)
    setApiKey('')
    sessionStorage.removeItem('admin_api_key')
  }

  async function handleDeleteTenant(tenant) {
    if (!confirm(`Delete tenant "${tenant.name}" (${tenant.id})?\n\nThis will permanently delete all events, templates, disciplines, members, and staffing data.`)) return
    try {
      await adminDelete(`/tenants/${tenant.id}`, apiKey.trim())
      await handleRefresh()
    } catch (err) {
      setError(`Failed to delete tenant: ${err.message}`)
    }
  }

  async function handleDeleteAccount(account) {
    if (!confirm(`Delete account "${account.email}" (${account.id})?\n\nThis will permanently delete all tenants owned by this account and all associated data.`)) return
    try {
      await adminDelete(`/accounts/${account.id}`, apiKey.trim())
      await handleRefresh()
    } catch (err) {
      setError(`Failed to delete account: ${err.message}`)
    }
  }

  function formatDate(ts) {
    if (!ts) return '—'
    return new Date(ts).toLocaleDateString('fi-FI', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  // ---- Login screen ----
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mb-6">Enter your admin API key to access the dashboard.</p>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="ADMIN_API_KEY"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none mb-4"
            autoFocus
          />
          <button
            onClick={handleLogin}
            disabled={loading || !apiKey.trim()}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
          <a href="#/" className="block text-center text-sm text-gray-400 hover:text-gray-600 mt-4">← Back to home</a>
        </div>
      </div>
    )
  }

  // ---- Dashboard ----
  const tenants = data?.tenants?.items || []
  const accounts = data?.accounts?.items || []
  const ssiSessions = data?.sessions?.ssiSessions ?? '—'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Admin Dashboard</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {data?.generatedAt ? `Generated: ${new Date(data.generatedAt).toLocaleString('fi-FI')}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleRefresh} disabled={loading} className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50">
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700">
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm font-medium text-gray-500">Tenants</div>
            <div className="text-3xl font-bold text-gray-900 mt-1">{tenants.length}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm font-medium text-gray-500">Accounts</div>
            <div className="text-3xl font-bold text-gray-900 mt-1">{accounts.length}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm font-medium text-gray-500">SSI Sessions</div>
            <div className="text-3xl font-bold text-gray-900 mt-1">{ssiSessions}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4">
          {['tenants', 'accounts', 'integrations'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'tenants' ? `Tenants (${tenants.length})` : tab === 'accounts' ? `Accounts (${accounts.length})` : 'Integration Types'}
            </button>
          ))}
        </div>

        {/* Tenants table */}
        {activeTab === 'tenants' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Tenant</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Owner</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Members</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">SSI</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Calendar</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Created</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tenants.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{t.name}</div>
                        <div className="text-xs text-gray-400 font-mono">{t.id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-700">{t.ownerName || '—'}</div>
                        <div className="text-xs text-gray-400">{t.ownerEmail || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{t.memberCount}</td>
                      <td className="px-4 py-3">
                        {t.ssiCredentials?.email ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Configured
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            Not set
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {t.calendarConfig?.wpBaseUrl ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Configured
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            Not set
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(t.createdAt)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDeleteTenant(t)}
                          className="text-xs text-red-500 hover:text-red-700 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {tenants.length === 0 && (
                    <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-400">No tenants found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Accounts table */}
        {activeTab === 'accounts' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Tenants</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">MFA</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Created</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {accounts.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{a.name}</div>
                        <div className="text-xs text-gray-400 font-mono">{a.id}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{a.email}</td>
                      <td className="px-4 py-3 text-gray-700">{a.tenantCount}</td>
                      <td className="px-4 py-3">
                        {a.mfaEnabled ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            Off
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(a.createdAt)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDeleteAccount(a)}
                          className="text-xs text-red-500 hover:text-red-700 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {accounts.length === 0 && (
                    <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-400">No accounts found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Integration Types catalog */}
        {activeTab === 'integrations' && (
          <IntegrationTypesPanel apiKey={apiKey} />
        )}
      </div>
    </div>
  )
}

// ---- Integration Types Panel (INT-1 Phase 5) ----

function IntegrationTypesPanel({ apiKey }) {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        // Fetch integration types from the platform API (uses session cookie, not admin key)
        const res = await fetch('/api/v1/platform/integration-types', {
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          setTypes(data.types || [])
        }
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="text-sm text-gray-400 py-8 text-center">Loading integration types...</div>
  }

  const eventTypes = types.filter(t => t.category === 'event_system')
  const calendarTypes = types.filter(t => t.category === 'calendar_system')

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Event Systems</h3>
          <p className="text-xs text-gray-400 mt-0.5">Competition management & scoring platforms</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Credential Fields</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {eventTypes.map(t => (
                <tr key={t.type} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{t.type}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{t.name}</div>
                    {t.description && <div className="text-xs text-gray-400">{t.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {t.credentialSchema?.map(f => (
                        <span key={f.key} className={`text-[10px] px-1.5 py-0.5 rounded ${f.required ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-500'}`}>
                          {f.key}{f.required ? '*' : ''}
                        </span>
                      ))}
                      {(!t.credentialSchema || t.credentialSchema.length === 0) && (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Enabled
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Calendar Systems</h3>
          <p className="text-xs text-gray-400 mt-0.5">Event publishing & scheduling platforms</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Credential Fields</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {calendarTypes.map(t => (
                <tr key={t.type} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{t.type}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{t.name}</div>
                    {t.description && <div className="text-xs text-gray-400">{t.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {t.credentialSchema?.map(f => (
                        <span key={f.key} className={`text-[10px] px-1.5 py-0.5 rounded ${f.required ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-500'}`}>
                          {f.key}{f.required ? '*' : ''}
                        </span>
                      ))}
                      {(!t.credentialSchema || t.credentialSchema.length === 0) && (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Enabled
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Integration types are code-deployed. Enable/disable and credential schema editing will be available when migrated to DB catalog (Phase 5b).
      </p>
    </div>
  )
}

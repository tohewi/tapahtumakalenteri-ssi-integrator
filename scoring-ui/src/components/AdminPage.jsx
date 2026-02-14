import { useState, useEffect } from 'react'
import { AppHeader } from './shared'

const API_BASE = '/api/admin'

/**
 * Admin Configuration Page
 *
 * Allows authorized admins to manage SSI Tools configuration:
 * - Staff management sites
 * - Admin users
 * - Event filters
 *
 * Requires admin authentication (checked via requireAuth('admin')).
 */
export default function AdminPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sites, setSites] = useState([])
  const [admins, setAdmins] = useState([])
  const [activeTab, setActiveTab] = useState('sites') // 'sites' or 'admins'

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)

      const [sitesRes, adminsRes] = await Promise.all([
        fetch(`${API_BASE}/sites`, { credentials: 'include' }),
        fetch(`${API_BASE}/users`, { credentials: 'include' })
      ])

      if (!sitesRes.ok || !adminsRes.ok) {
        if (sitesRes.status === 403 || adminsRes.status === 403) {
          throw new Error('Admin access denied. You are not authorized.')
        }
        if (sitesRes.status === 503 || adminsRes.status === 503) {
          const data = await (sitesRes.status === 503 ? sitesRes : adminsRes).json()
          throw new Error(data.error || 'Database not available. Admin features require DATABASE_URL to be configured.')
        }
        throw new Error('Failed to load configuration')
      }

      const sitesData = await sitesRes.json()
      const adminsData = await adminsRes.json()

      setSites(sitesData.sites || [])
      setAdmins(adminsData.users || [])
    } catch (err) {
      console.error('Load error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function deleteSite(siteKey) {
    if (!confirm(`Delete site "${siteKey}"?`)) return

    try {
      const res = await fetch(`${API_BASE}/sites/${siteKey}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!res.ok) throw new Error('Failed to delete site')

      await loadData()
    } catch (err) {
      alert(`Error: ${err.message}`)
    }
  }

  async function deleteAdmin(email) {
    if (!confirm(`Remove admin "${email}"?`)) return

    try {
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to remove admin')
      }

      await loadData()
    } catch (err) {
      alert(`Error: ${err.message}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader title="Admin Configuration" subtitle="Loading..." />
        <div className="p-4 text-center text-gray-600">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader title="Admin Configuration" subtitle="Error" />
        <div className="p-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-semibold">Error</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
          <button
            onClick={() => window.location.href = '#/'}
            className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-lg"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Admin Configuration" subtitle="Manage SSI Tools settings" />

      <div className="p-4">
        {/* Tab navigation */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('sites')}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
              activeTab === 'sites'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200'
            }`}
          >
            Staff Sites ({sites.length})
          </button>
          <button
            onClick={() => setActiveTab('admins')}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
              activeTab === 'admins'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200'
            }`}
          >
            Admins ({admins.length})
          </button>
        </div>

        {/* Sites tab */}
        {activeTab === 'sites' && (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-semibold">Staff Management Sites</p>
              <p className="mt-1">
                Each site represents a different staff management configuration (e.g., "Temppeli-SRA", "Kupittaa").
                Click a site to view or edit its configuration.
              </p>
            </div>

            {sites.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-500">
                No sites configured yet
              </div>
            ) : (
              sites.map(site => (
                <div
                  key={site.id}
                  className="bg-white border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg text-gray-800">{site.name}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Key: <code className="bg-gray-100 px-1 rounded">{site.key}</code>
                      </p>
                      <p className="text-sm text-gray-600 mt-2">
                        {site.organizationName}
                        {site.organizationRange && ` • ${site.organizationRange}`}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Created: {new Date(site.createdAt).toLocaleDateString('fi-FI')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={`#/admin/sites/${site.key}`}
                        className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg"
                      >
                        Edit
                      </a>
                      <button
                        onClick={() => deleteSite(site.key)}
                        className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}

            <a
              href="#/admin/sites/new"
              className="block w-full py-3 bg-green-600 text-white text-center font-semibold rounded-lg"
            >
              + Create New Site
            </a>
          </div>
        )}

        {/* Admins tab */}
        {activeTab === 'admins' && (
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              <p className="font-semibold">Admin Users</p>
              <p className="mt-1">
                Only users in this list can access the admin configuration.
                Root admin is created from ADMIN_ROOT_EMAIL environment variable.
              </p>
            </div>

            {admins.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-500">
                No admins configured
              </div>
            ) : (
              admins.map(admin => (
                <div
                  key={admin.id}
                  className="bg-white border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{admin.email}</span>
                        {admin.isRoot && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded">
                            ROOT
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Added: {new Date(admin.createdAt).toLocaleDateString('fi-FI')}
                        {admin.lastLoginAt && ` • Last login: ${new Date(admin.lastLoginAt).toLocaleDateString('fi-FI')}`}
                      </p>
                    </div>
                    {!admin.isRoot && (
                      <button
                        onClick={() => deleteAdmin(admin.email)}
                        className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}

            <button
              onClick={() => {
                const email = prompt('Enter email address of new admin:')
                if (!email) return

                fetch(`${API_BASE}/users`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ email })
                })
                .then(res => {
                  if (!res.ok) throw new Error('Failed to add admin')
                  return loadData()
                })
                .catch(err => alert(`Error: ${err.message}`))
              }}
              className="block w-full py-3 bg-green-600 text-white text-center font-semibold rounded-lg"
            >
              + Add Admin User
            </button>
          </div>
        )}

        {/* Back button */}
        <a
          href="#/"
          className="block w-full mt-6 py-3 bg-gray-600 text-white text-center font-semibold rounded-lg"
        >
          Back to Home
        </a>
      </div>
    </div>
  )
}

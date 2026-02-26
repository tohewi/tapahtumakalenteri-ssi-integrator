// ============================================================
// TenantCreatePage — Wizard for creating a new tenant
//
// Simple single-step form for now. Future phases will add
// SSI credential setup, calendar config, discipline selection.
// ============================================================

import { useState } from 'react'

export default function TenantCreatePage({ error, onCreateTenant, onCancel }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLocalError(null)
    setLoading(true)
    try {
      await onCreateTenant({ name })
    } catch (err) {
      setLocalError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const displayError = localError || error

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="text-lg font-bold text-sky-700">Match Management</div>
          <button
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Create New Tenant</h1>
          <p className="text-gray-500 text-sm">
            A tenant represents your organization or club. Each tenant has its own
            templates, events, and instructor roster.
          </p>
        </div>

        {displayError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
            {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-6">
          {/* Step 1: Basic info */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-sky-600 rounded-full flex items-center justify-center text-white text-xs font-bold">1</div>
              <h3 className="font-semibold">Organization Details</h3>
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                Organization Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. TurRes, RaiResUps"
                required
                minLength={2}
                maxLength={100}
                autoFocus
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                This will be shown in the tenant switcher and used to identify your organization.
              </p>
            </div>
          </div>

          {/* Step 2: Coming soon placeholders */}
          <div className="opacity-50">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center text-white text-xs font-bold">2</div>
              <h3 className="font-semibold text-gray-400">SSI Credentials</h3>
              <span className="text-xs text-gray-400 italic ml-2">— configure after creation</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-dashed border-gray-300">
              <p className="text-xs text-gray-400">
                SSI email, password, and API key for event management. You can configure these in tenant settings after creation.
              </p>
            </div>
          </div>

          <div className="opacity-50">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center text-white text-xs font-bold">3</div>
              <h3 className="font-semibold text-gray-400">Calendar Backend</h3>
              <span className="text-xs text-gray-400 italic ml-2">— configure after creation</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-dashed border-gray-300">
              <p className="text-xs text-gray-400">
                WordPress / Tapahtumakalenteri integration for publishing events to your club calendar.
              </p>
            </div>
          </div>

          {/* Trial info */}
          <div className="bg-sky-50 border border-sky-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sky-600 text-lg">🎉</span>
              <div>
                <div className="text-sm font-medium text-sky-800">30-day free trial</div>
                <div className="text-xs text-sky-600">Full functionality, no credit card required.</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm border rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="bg-sky-600 text-white px-6 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create Tenant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

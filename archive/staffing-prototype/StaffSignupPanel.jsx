import { useState } from 'react'
import t from '../i18n'
import { staffSignup, staffCancelSignup } from '../staffing-api'

export default function StaffSignupPanel({ event, isAdmin, onUpdate }) {
  const [rolePreference, setRolePreference] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const isOpen = event.status === 'open'

  async function handleSignup() {
    try {
      setLoading(true)
      setError(null)
      setSuccess(null)
      const result = await staffSignup(event.eventId, rolePreference || null)
      setSuccess(`${t.queuePosition}: #${result.queuePosition}`)
      onUpdate()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    if (!confirm(t.staffCancelConfirm)) return
    try {
      setLoading(true)
      setError(null)
      setSuccess(null)
      await staffCancelSignup(event.eventId)
      setSuccess(t.staffCancelled)
      onUpdate()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-orange-700">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m9.364-7.364l-1.414 1.414M21 12h-2m0 0h-2m2 0v2m0-2V10M3.636 4.636l1.414 1.414M3 12h2m0 0h2m-2 0v2m0-2V10" />
          </svg>
          <span className="font-medium">{t.adminOnly}</span>
        </div>
      </div>
    )
  }

  if (!isOpen) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-500">
        {event.status === 'finalized' ? t.eventFinalized : t.registrationClosed}
      </div>
    )
  }

  return (
    <div className="bg-white border border-orange-200 rounded-xl p-4 space-y-3">
      <h3 className="font-semibold text-gray-800">{t.staffSignup}</h3>

      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span>{t.staffPositionsAvailable.replace('{count}', event.staffPositions)}</span>
        <span className="text-gray-300">·</span>
        <span>{t.shooterCount}: {event.shooterCount}</span>
        <span className="text-gray-300">·</span>
        <span>{t.activeSquads}: {event.activeSquadCount}</span>
      </div>

      {/* Role preference selector */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">{t.rolePreference}</label>
        <select
          value={rolePreference}
          onChange={e => setRolePreference(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          <option value="">{t.noPreference}</option>
          <option value="leadInstructor">{t.leadInstructor}</option>
          <option value="equipmentManager">{t.equipmentManager}</option>
        </select>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      )}
      {success && (
        <div className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">{success}</div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSignup}
          disabled={loading}
          className="flex-1 bg-orange-500 text-white font-medium py-2.5 px-4 rounded-lg active:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {loading ? t.loading : t.staffSignup}
        </button>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg active:bg-gray-100 disabled:opacity-50 transition-colors"
        >
          {t.staffCancel}
        </button>
      </div>
    </div>
  )
}

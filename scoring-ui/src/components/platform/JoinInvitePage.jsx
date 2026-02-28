// ============================================================
// JoinInvitePage — Accept an invitation to join a tenant
//
// Shows details of the invitation and allows the user to:
//   a) Accept (if already logged in)
//   b) Set password + name (if not logged in)
// ============================================================

import { useState, useEffect } from 'react'
import { getInvitationByToken, acceptInvitation, platformStatus } from '../../platform-api.js'

export default function JoinInvitePage({ token, onComplete, onCancel }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [invitation, setInvitation] = useState(null)
  const [hasSession, setHasSession] = useState(false)
  
  // Form state (for new users)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        // 1. Check if user is already logged in
        const status = await platformStatus()
        setHasSession(status.authenticated)
        if (status.authenticated && status.account) {
          setName(status.account.name || '')
        }

        // 2. Fetch invitation details
        const data = await getInvitationByToken(token)
        setInvitation(data.invitation)
      } catch (err) {
        setError(err.message || 'Failed to load invitation. The link may have expired.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  async function handleSubmit(e) {
    e?.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      // Send the accept request.
      // The backend will create the account if needed and set the session cookie.
      const data = await acceptInvitation(token, hasSession ? {} : { name, password })
      
      // Fetch the updated full session state to pass back to App
      const statusData = await platformStatus()
      if (statusData.authenticated) {
        onComplete({
          account: statusData.account,
          tenants: statusData.tenants,
          selectedTenantId: data.tenantId, // Select the tenant we just joined
        })
      } else {
        throw new Error('Failed to create session after accepting invitation.')
      }
    } catch (err) {
      setError(err.message || 'Failed to accept invitation.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-gray-500">Loading invitation...</div>
      </div>
    )
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border text-center space-y-4">
          <div className="text-4xl">❌</div>
          <h1 className="text-xl font-bold text-gray-900">Invalid Invitation</h1>
          <p className="text-sm text-gray-600">{error}</p>
          <button
            onClick={onCancel}
            className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-200 transition-colors mt-4"
          >
            Go to Platform
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border space-y-6">
        
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Join {invitation.tenantName}</h1>
          <p className="text-sm text-gray-500">
            You have been invited by {invitation.invitedByName} to join their organization.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm border border-red-200">
            {error}
          </div>
        )}

        <div className="bg-sky-50 text-sky-800 p-4 rounded-lg text-sm border border-sky-100 flex flex-col gap-1">
          <div><span className="font-semibold">Email:</span> {invitation.email}</div>
          <div><span className="font-semibold">Roles:</span> {invitation.roles.join(', ')}</div>
        </div>

        {hasSession ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 text-center">
              You are currently logged in. Do you want to accept this invitation?
            </p>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 bg-white border text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmit()}
                disabled={submitting}
                className="flex-1 bg-sky-600 text-white py-2.5 rounded-lg font-medium hover:bg-sky-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Accepting...' : 'Accept Invite'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-700 text-center mb-4">
              Please enter your name and create a password to set up your account.
            </p>
            
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-shadow"
                placeholder="Matti Meikäläinen"
              />
            </div>
            
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Create Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-shadow"
                placeholder="Min. 8 characters"
              />
            </div>
            
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 bg-white border text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-sky-600 text-white py-2.5 rounded-lg font-medium hover:bg-sky-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Creating...' : 'Create Account & Join'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

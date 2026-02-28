// ============================================================
// MembersPage — Manage tenant members and invitations
//
// Sections:
//   1. Current Members — list, edit roles, remove
//   2. Pending Invitations — list, revoke
//   3. Invite New — email + role picker
//
// Requires owner or tenant_admin role.
// ============================================================

import { useState, useEffect } from 'react'
import {
  listMembers,
  updateMemberRoles,
  removeMember,
  listInvitations,
  createInvitation,
  revokeInvitation,
} from '../../platform-api.js'

// All platform roles for the role picker
const ALL_ROLES = ['owner', 'tenant_admin', 'discipline_admin', 'instructor_admin', 'match_admin', 'instructor']

// Human-readable role labels
const ROLE_LABELS = {
  owner: 'Owner',
  tenant_admin: 'Tenant Admin',
  discipline_admin: 'Discipline Admin',
  instructor_admin: 'Instructor Admin',
  match_admin: 'Match Admin',
  instructor: 'Instructor',
}

function StatusMessage({ type, message }) {
  if (!message) return null
  const styles = {
    success: 'bg-green-50 border-green-200 text-green-700',
    error: 'bg-red-50 border-red-200 text-red-700',
  }
  return (
    <div className={`border rounded-lg px-4 py-2.5 text-sm mb-4 ${styles[type] || styles.error}`}>
      {message}
    </div>
  )
}

function RoleBadge({ role }) {
  const colors = {
    owner: 'bg-purple-100 text-purple-700',
    tenant_admin: 'bg-sky-100 text-sky-700',
    discipline_admin: 'bg-teal-100 text-teal-700',
    instructor_admin: 'bg-amber-100 text-amber-700',
    match_admin: 'bg-indigo-100 text-indigo-700',
    instructor: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${colors[role] || 'bg-gray-100 text-gray-600'}`}>
      {ROLE_LABELS[role] || role}
    </span>
  )
}

// ---- Members List ----

function MembersList({ tenantId, members, onRefresh, currentAccountId }) {
  const [editingId, setEditingId] = useState(null)
  const [editRoles, setEditRoles] = useState([])
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  function startEdit(member) {
    setEditingId(member.accountId)
    setEditRoles([...member.roles])
    setStatus(null)
  }

  function toggleRole(role) {
    setEditRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  async function handleSaveRoles(accountId) {
    if (editRoles.length === 0) {
      setStatus({ type: 'error', message: 'At least one role is required' })
      return
    }
    setSaving(true)
    setStatus(null)
    try {
      await updateMemberRoles(tenantId, accountId, editRoles)
      setEditingId(null)
      onRefresh()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(accountId, name) {
    if (!confirm(`Remove ${name} from this tenant?`)) return
    try {
      await removeMember(tenantId, accountId)
      onRefresh()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    }
  }

  return (
    <div className="bg-white rounded-lg border p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Members</h2>
      <p className="text-sm text-gray-500 mb-4">People who have access to this tenant.</p>

      <StatusMessage {...(status || {})} />

      {members.length === 0 ? (
        <div className="text-sm text-gray-400">No members found.</div>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.accountId} className="bg-gray-50 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm text-gray-900">
                    {m.name || m.email}
                    {m.accountId === currentAccountId && (
                      <span className="text-xs text-gray-400 ml-2">(you)</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">{m.email}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {m.roles.map(r => <RoleBadge key={r} role={r} />)}
                  </div>
                </div>
                {m.accountId !== currentAccountId && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(m)}
                      className="text-xs text-sky-600 hover:text-sky-800"
                    >
                      Edit Roles
                    </button>
                    <button
                      onClick={() => handleRemove(m.accountId, m.name || m.email)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              {/* Inline role editor */}
              {editingId === m.accountId && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="text-xs font-medium text-gray-600 mb-2">Select roles:</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {ALL_ROLES.map(role => (
                      <label key={role} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editRoles.includes(role)}
                          onChange={() => toggleRole(role)}
                          className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                        />
                        {ROLE_LABELS[role]}
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveRoles(m.accountId)}
                      disabled={saving || editRoles.length === 0}
                      className="bg-sky-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors"
                    >
                      {saving ? 'Saving...' : 'Save Roles'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Pending Invitations ----

function InvitationsList({ tenantId, invitations, onRefresh }) {
  const [status, setStatus] = useState(null)

  async function handleRevoke(invId) {
    if (!confirm('Revoke this invitation?')) return
    try {
      await revokeInvitation(tenantId, invId)
      onRefresh()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    }
  }

  if (invitations.length === 0) return null

  return (
    <div className="bg-white rounded-lg border p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Pending Invitations</h2>
      <p className="text-sm text-gray-500 mb-4">Invitations that have been sent but not yet accepted.</p>

      <StatusMessage {...(status || {})} />

      <div className="space-y-2">
        {invitations.map(inv => (
          <div key={inv.id} className="bg-amber-50 rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <div className="font-medium text-sm text-gray-900">{inv.email}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {(inv.roles || []).map(r => <RoleBadge key={r} role={r} />)}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Expires: {new Date(inv.expiresAt).toLocaleDateString('fi-FI')}
              </div>
            </div>
            <button
              onClick={() => handleRevoke(inv.id)}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Revoke
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Invite Form ----

function InviteForm({ tenantId, onRefresh }) {
  const [email, setEmail] = useState('')
  const [roles, setRoles] = useState(['instructor'])
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState(null)

  function toggleRole(role) {
    setRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (roles.length === 0) {
      setStatus({ type: 'error', message: 'Select at least one role' })
      return
    }
    setSending(true)
    setStatus(null)
    try {
      await createInvitation(tenantId, { email: email.trim(), roles })
      setStatus({ type: 'success', message: `Invitation sent to ${email.trim()}` })
      setEmail('')
      setRoles(['instructor'])
      onRefresh()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Invite Member</h2>
      <p className="text-sm text-gray-500 mb-4">Send an invitation link by email. The recipient can create an account and join this tenant.</p>

      <StatusMessage {...(status || {})} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="colleague@example.com"
            className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Roles</label>
          <div className="flex flex-wrap gap-3">
            {ALL_ROLES.filter(r => r !== 'owner').map(role => (
              <label key={role} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  onChange={() => toggleRole(role)}
                  className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">Owner role can only be assigned by editing an existing member.</p>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sending || !email.trim() || roles.length === 0}
            className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? 'Sending...' : 'Send Invitation'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ---- Main Page ----

export default function MembersPage({ tenantId, currentAccountId }) {
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadData() {
    try {
      const [membersData, invitationsData] = await Promise.all([
        listMembers(tenantId),
        listInvitations(tenantId),
      ])
      setMembers(membersData.members || [])
      setInvitations(invitationsData.invitations || [])
    } catch { /* ignore load errors */ }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [tenantId])

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Members & Invitations</h1>
        <p className="text-sm text-gray-400 mb-6">Manage who has access to this tenant.</p>
        <div className="text-sm text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Members & Invitations</h1>
      <p className="text-sm text-gray-400 mb-6">Manage who has access to this tenant.</p>

      <MembersList
        tenantId={tenantId}
        members={members}
        onRefresh={loadData}
        currentAccountId={currentAccountId}
      />

      <InvitationsList
        tenantId={tenantId}
        invitations={invitations}
        onRefresh={loadData}
      />

      <InviteForm
        tenantId={tenantId}
        onRefresh={loadData}
      />
    </div>
  )
}

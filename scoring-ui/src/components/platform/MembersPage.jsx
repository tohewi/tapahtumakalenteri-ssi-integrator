// ============================================================
// MembersPage — Consolidated member management
//
// The single place for managing tenant members:
//   - Member table with role badges, inline role editor, remove
//   - "Invite Member" button → modal popup
//   - Pending invitations with revoke
//
// Requires owner or tenant_admin role.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import {
  listMembers,
  updateMemberRoles,
  removeMember,
  listInvitations,
  createInvitation,
  revokeInvitation,
} from '../../platform-api.js'

// Available roles with descriptions (for invite modal)
const AVAILABLE_ROLES = [
  { id: 'owner', label: 'Owner', desc: 'Full access, billing, and SSI credentials' },
  { id: 'tenant_admin', label: 'Tenant Admin', desc: 'Manage members and all settings' },
  { id: 'match_admin', label: 'Match Admin', desc: 'Manage templates and schedule matches' },
  { id: 'discipline_admin', label: 'Discipline Admin', desc: 'Manage disciplines' },
  { id: 'instructor_admin', label: 'Instructor Admin', desc: 'Approve instructors' },
  { id: 'instructor', label: 'Instructor', desc: 'Can act as match staff/RO' },
]

// Role label lookup
const ROLE_LABELS = Object.fromEntries(AVAILABLE_ROLES.map(r => [r.id, r.label]))

// Role badge colors
const ROLE_COLORS = {
  owner: 'bg-purple-50 text-purple-700 border-purple-100',
  tenant_admin: 'bg-sky-50 text-sky-700 border-sky-100',
  discipline_admin: 'bg-teal-50 text-teal-700 border-teal-100',
  instructor_admin: 'bg-amber-50 text-amber-700 border-amber-100',
  match_admin: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  instructor: 'bg-gray-100 text-gray-600 border-gray-200',
}

// Format a date string for display using browser locale
function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ---- Main Component ----

export default function MembersPage({ tenantId, currentAccountId }) {
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', roles: ['instructor'] })
  const [inviteError, setInviteError] = useState(null)
  const [inviting, setInviting] = useState(false)

  // Role editing state
  const [editingMember, setEditingMember] = useState(null)
  const [editRoles, setEditRoles] = useState([])
  const [savingRoles, setSavingRoles] = useState(false)

  const loadData = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setError(null)
    try {
      const [mRes, iRes] = await Promise.all([
        listMembers(tenantId),
        listInvitations(tenantId),
      ])
      setMembers(mRes.members || [])
      setInvitations(iRes.invitations || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ---- Invite handlers ----

  async function handleInviteSubmit(e) {
    e.preventDefault()
    setInviteError(null)
    if (inviteForm.roles.length === 0) {
      setInviteError('Select at least one role.')
      return
    }
    setInviting(true)
    try {
      await createInvitation(tenantId, inviteForm)
      setShowInviteModal(false)
      setInviteForm({ email: '', roles: ['instructor'] })
      loadData()
    } catch (err) {
      setInviteError(err.message)
    } finally {
      setInviting(false)
    }
  }

  function toggleInviteRole(roleId) {
    setInviteForm(prev => ({
      ...prev,
      roles: prev.roles.includes(roleId)
        ? prev.roles.filter(r => r !== roleId)
        : [...prev.roles, roleId]
    }))
  }

  async function handleRevokeInvite(invId) {
    if (!window.confirm('Revoke this invitation?')) return
    try {
      await revokeInvitation(tenantId, invId)
      loadData()
    } catch (err) {
      alert('Failed to revoke: ' + err.message)
    }
  }

  // ---- Member handlers ----

  function startEditRoles(member) {
    setEditingMember(member.memberId)
    setEditRoles(member.roles || [])
  }

  function toggleEditRole(roleId) {
    setEditRoles(prev =>
      prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]
    )
  }

  async function saveRoles() {
    if (editRoles.length === 0) {
      alert('A member must have at least one role.')
      return
    }
    setSavingRoles(true)
    try {
      await updateMemberRoles(tenantId, editingMember, editRoles)
      setEditingMember(null)
      loadData()
    } catch (err) {
      alert('Failed to update roles: ' + err.message)
    } finally {
      setSavingRoles(false)
    }
  }

  async function handleRemoveMember(memberId, name) {
    if (!window.confirm(`Remove ${name} from this organization?`)) return
    try {
      await removeMember(tenantId, memberId)
      loadData()
    } catch (err) {
      alert('Failed to remove member: ' + err.message)
    }
  }

  // ---- Render ----

  if (loading) return <div className="p-6 text-gray-500">Loading members...</div>
  if (error) return <div className="p-6 text-red-500">Error: {error}</div>

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Members & Invitations</h1>
          <p className="text-sm text-gray-500">Manage members and their roles in your organization.</p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm hover:bg-sky-700 font-medium whitespace-nowrap"
        >
          Invite Member
        </button>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="mb-8">
          <h3 className="font-semibold text-gray-800 mb-3">Pending Invitations ({invitations.length})</h3>
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Roles</th>
                  <th className="px-4 py-3 font-medium">Invited</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invitations.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{inv.email}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex gap-1 flex-wrap">
                        {(inv.roles || []).map(r => (
                          <span key={r} className={`px-2 py-0.5 rounded-full border ${ROLE_COLORS[r] || 'bg-gray-100 text-gray-600'}`}>
                            {ROLE_LABELS[r] || r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(inv.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRevokeInvite(inv.id)}
                        className="text-red-600 hover:text-red-800 text-xs font-medium"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active Members */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">Active Members ({members.length})</h3>
        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Roles</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map(member => (
                <tr key={member.memberId || member.accountId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-sky-100 rounded-full flex items-center justify-center text-sky-700 text-[10px] font-bold">
                        {member.accountName ? member.accountName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '?'}
                      </div>
                      <span className="font-medium text-gray-900">{member.accountName || 'Unknown'}</span>
                      {member.accountId === currentAccountId && (
                        <span className="text-xs text-gray-400">(you)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{member.accountEmail}</td>
                  <td className="px-4 py-3">
                    {editingMember === member.memberId ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-1">
                          {AVAILABLE_ROLES.map(role => (
                            <label key={role.id} className="flex items-center gap-1 text-xs cursor-pointer bg-gray-50 px-2 py-1 rounded border">
                              <input
                                type="checkbox"
                                checked={editRoles.includes(role.id)}
                                onChange={() => toggleEditRole(role.id)}
                              />
                              {role.label}
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveRoles} disabled={savingRoles} className="text-xs bg-sky-600 text-white px-2 py-1 rounded">
                            {savingRoles ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => setEditingMember(null)} className="text-xs border px-2 py-1 rounded">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1 flex-wrap">
                        {(member.roles || []).map(r => (
                          <span key={r} className={`px-2 py-0.5 rounded-full border text-xs ${ROLE_COLORS[r] || 'bg-gray-100 text-gray-600'}`}>
                            {ROLE_LABELS[r] || r}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(member.joinedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingMember !== member.memberId && (
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => startEditRoles(member)}
                          className="text-sky-600 hover:text-sky-800 text-xs font-medium"
                        >
                          Roles
                        </button>
                        {member.accountId !== currentAccountId && (
                          <button
                            onClick={() => handleRemoveMember(member.memberId, member.accountName || member.accountEmail)}
                            className="text-red-600 hover:text-red-800 text-xs font-medium"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan="5" className="p-4 text-center text-gray-500">No members found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-1">Invite Member</h2>
            <p className="text-sm text-gray-500 mb-4">Send an invitation link by email. The recipient can create an account and join this tenant.</p>
            <form onSubmit={handleInviteSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-sky-500 focus:border-sky-500"
                  placeholder="colleague@example.com"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Roles</label>
                <div className="space-y-2 p-1">
                  {AVAILABLE_ROLES.filter(r => r.id !== 'owner').map(role => (
                    <label key={role.id} className="flex items-start gap-2 p-2 border rounded-md hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 text-sky-600"
                        checked={inviteForm.roles.includes(role.id)}
                        onChange={() => toggleInviteRole(role.id)}
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{role.label}</div>
                        <div className="text-xs text-gray-500">{role.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">Owner role can only be assigned by editing an existing member.</p>
              </div>

              {inviteError && (
                <div className="mb-4 text-sm text-red-600 bg-red-50 p-2 rounded">{inviteError}</div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowInviteModal(false); setInviteError(null) }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md disabled:opacity-50"
                >
                  {inviting ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

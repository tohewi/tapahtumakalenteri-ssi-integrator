// ============================================================
// AccountSettingsPage — Account profile and security settings
//
// Sections:
//   1. Profile — name and email editing
//   2. Password — change password (current + new + confirm)
//
// All saves go through platform-api.js client methods.
// ============================================================

import { useState } from 'react'
import { updateAccountProfile, changeAccountPassword } from '../../platform-api.js'

// ---- Sub-components ----

function SectionCard({ title, description, children }) {
  return (
    <div className="bg-white rounded-lg border p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">{title}</h2>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      {children}
    </div>
  )
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

// ---- Profile Section ----

function ProfileSection({ account, onAccountUpdated }) {
  const [name, setName] = useState(account.name || '')
  const [email, setEmail] = useState(account.email || '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  const hasChanges = name.trim() !== account.name || email.trim().toLowerCase() !== account.email

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      const updates = {}
      if (name.trim() !== account.name) updates.name = name.trim()
      if (email.trim().toLowerCase() !== account.email) updates.email = email.trim()

      const data = await updateAccountProfile(updates)
      onAccountUpdated(data.account)
      setStatus({ type: 'success', message: 'Profile updated' })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard title="Profile" description="Your account name and email address.">
      <StatusMessage {...(status || {})} />
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            minLength={2}
            maxLength={100}
            className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
          />
          <p className="text-xs text-gray-400 mt-1">
            This is your login email. Changing it will require you to use the new email to sign in.
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !hasChanges || name.trim().length < 2}
            className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </SectionCard>
  )
}

// ---- Password Section ----

function PasswordSection() {
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const passwordsMatch = form.newPassword === form.confirmPassword
  const canSubmit = form.currentPassword.length > 0 &&
    form.newPassword.length >= 8 &&
    passwordsMatch

  async function handleSave(e) {
    e.preventDefault()
    if (!passwordsMatch) return

    setSaving(true)
    setStatus(null)
    try {
      await changeAccountPassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      })
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setStatus({ type: 'success', message: 'Password changed successfully' })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard title="Change Password" description="Update your account password. You must enter your current password to confirm.">
      <StatusMessage {...(status || {})} />
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
            Current Password
          </label>
          <input
            type="password"
            name="currentPassword"
            value={form.currentPassword}
            onChange={handleChange}
            required
            autoComplete="current-password"
            className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
            New Password
          </label>
          <input
            type="password"
            name="newPassword"
            value={form.newPassword}
            onChange={handleChange}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
          />
          {form.newPassword.length > 0 && form.newPassword.length < 8 && (
            <p className="text-xs text-amber-600 mt-1">Minimum 8 characters</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
            Confirm New Password
          </label>
          <input
            type="password"
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={handleChange}
            required
            autoComplete="new-password"
            className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
          />
          {form.confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </form>
    </SectionCard>
  )
}

// ---- Main Page ----

export default function AccountSettingsPage({ account, onAccountUpdated, onBack, onLogout }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Back to dashboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-lg font-bold text-sky-700">Match Management</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-sky-100 rounded-full flex items-center justify-center text-sky-700 text-sm font-semibold">
                {account?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
              </div>
              <span className="text-sm text-gray-600 hidden sm:inline">{account?.email}</span>
              <button
                onClick={onLogout}
                className="text-xs text-gray-400 hover:text-gray-600 ml-2"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 bg-sky-100 rounded-lg flex items-center justify-center text-sky-700 text-xl font-bold">
            {account?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
            <p className="text-sm text-gray-500">Manage your profile and security</p>
          </div>
        </div>

        {/* Settings sections */}
        <ProfileSection account={account} onAccountUpdated={onAccountUpdated} />
        <PasswordSection />
      </div>
    </div>
  )
}

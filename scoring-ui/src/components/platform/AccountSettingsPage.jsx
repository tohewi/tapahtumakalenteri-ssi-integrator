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
import { updateAccountProfile, changeAccountPassword, mfaSetup, mfaConfirm, mfaDisable } from '../../platform-api.js'

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

// ---- MFA Section ----

function MfaSection({ account, onAccountUpdated }) {
  const [step, setStep] = useState('idle') // idle, setup, confirm, disable
  const [qrCode, setQrCode] = useState(null)
  const [recoveryCodes, setRecoveryCodes] = useState([])
  const [confirmCode, setConfirmCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [showCodes, setShowCodes] = useState(false)

  const mfaEnabled = account?.mfaEnabled || false

  async function handleSetup() {
    setLoading(true)
    setStatus(null)
    try {
      const data = await mfaSetup()
      setQrCode(data.qrCodeDataUrl)
      setRecoveryCodes(data.recoveryCodes)
      setStep('setup')
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm(e) {
    e.preventDefault()
    if (confirmCode.length !== 6) return
    setLoading(true)
    setStatus(null)
    try {
      await mfaConfirm({ code: confirmCode })
      setStep('idle')
      setConfirmCode('')
      setQrCode(null)
      setStatus({ type: 'success', message: 'MFA enabled successfully!' })
      // Update account state
      onAccountUpdated({ ...account, mfaEnabled: true })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  async function handleDisable(e) {
    e.preventDefault()
    setLoading(true)
    setStatus(null)
    try {
      await mfaDisable({ password: disablePassword })
      setStep('idle')
      setDisablePassword('')
      setStatus({ type: 'success', message: 'MFA has been disabled.' })
      onAccountUpdated({ ...account, mfaEnabled: false })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  function handleCancel() {
    setStep('idle')
    setQrCode(null)
    setRecoveryCodes([])
    setConfirmCode('')
    setDisablePassword('')
    setStatus(null)
  }

  return (
    <SectionCard
      title="Two-Factor Authentication (MFA)"
      description="Add an extra layer of security to your account using an authenticator app."
    >
      <StatusMessage {...(status || {})} />

      {/* Status indicator */}
      <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-md text-sm ${
        mfaEnabled ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
      }`}>
        <span className={`w-2 h-2 rounded-full ${mfaEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
        {mfaEnabled ? 'MFA is enabled' : 'MFA is not enabled'}
      </div>

      {/* Idle state — show enable or disable button */}
      {step === 'idle' && !mfaEnabled && (
        <button
          onClick={handleSetup}
          disabled={loading}
          className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Setting up...' : 'Enable MFA'}
        </button>
      )}

      {step === 'idle' && mfaEnabled && (
        <button
          onClick={() => setStep('disable')}
          className="text-sm text-red-500 hover:text-red-700 font-medium"
        >
          Disable MFA
        </button>
      )}

      {/* Setup step — show QR code and recovery codes */}
      {step === 'setup' && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 border">
            <div className="text-sm font-semibold text-gray-700 mb-3">
              Step 1: Scan the QR code with your authenticator app
            </div>
            {qrCode && (
              <div className="flex justify-center mb-3">
                <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
              </div>
            )}
            <p className="text-xs text-gray-500 text-center">
              Use Google Authenticator, Authy, or any TOTP-compatible app.
            </p>
          </div>

          <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-amber-800">
                Step 2: Save your recovery codes
              </div>
              <button
                onClick={() => setShowCodes(!showCodes)}
                className="text-xs text-amber-600 hover:text-amber-800"
              >
                {showCodes ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-amber-700 mb-3">
              These codes can be used if you lose access to your authenticator app. Each code can only be used once. Save them securely!
            </p>
            {showCodes && (
              <div className="grid grid-cols-2 gap-1 bg-white rounded-md p-3 border font-mono text-sm">
                {recoveryCodes.map((code, i) => (
                  <div key={i} className="text-gray-700 py-0.5">{code}</div>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                const text = recoveryCodes.join('\n')
                navigator.clipboard?.writeText(text)
                  .then(() => setStatus({ type: 'success', message: 'Recovery codes copied to clipboard' }))
                  .catch(() => {})
              }}
              className="text-xs text-sky-600 hover:text-sky-800 mt-2"
            >
              Copy to clipboard
            </button>
          </div>

          <form onSubmit={handleConfirm} className="bg-gray-50 rounded-lg p-4 border">
            <div className="text-sm font-semibold text-gray-700 mb-2">
              Step 3: Enter the code from your authenticator app
            </div>
            <div className="flex items-end gap-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={confirmCode}
                onChange={e => setConfirmCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoFocus
                autoComplete="one-time-code"
                className="border rounded-md px-3 py-2 text-center text-lg font-mono tracking-widest w-36 focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || confirmCode.length !== 6}
                className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Verifying...' : 'Verify & Enable'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Disable step — require password */}
      {step === 'disable' && (
        <form onSubmit={handleDisable} className="bg-red-50 rounded-lg p-4 border border-red-200 space-y-3">
          <div className="text-sm font-semibold text-red-800">
            Disable MFA
          </div>
          <p className="text-xs text-red-700">
            Enter your password to confirm. Your account will no longer require a second factor to sign in.
          </p>
          <div className="flex items-end gap-3">
            <input
              type="password"
              value={disablePassword}
              onChange={e => setDisablePassword(e.target.value)}
              placeholder="Current password"
              required
              autoFocus
              className="border rounded-md px-3 py-2 text-sm w-64 focus:ring-2 focus:ring-red-200 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !disablePassword}
              className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Disabling...' : 'Disable MFA'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </SectionCard>
  )
}

// ---- Main Page ----

export default function AccountSettingsPage({ account, onAccountUpdated, onBack, onLogout }) {
  const initials = account?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 bg-sky-100 rounded-lg flex items-center justify-center text-sky-700 text-xl font-bold">
          {initials}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
          <p className="text-sm text-gray-500">Manage your profile and security</p>
        </div>
      </div>

      {/* Settings sections */}
      <ProfileSection account={account} onAccountUpdated={onAccountUpdated} />
      <PasswordSection />
      <MfaSection account={account} onAccountUpdated={onAccountUpdated} />
    </div>
  )
}

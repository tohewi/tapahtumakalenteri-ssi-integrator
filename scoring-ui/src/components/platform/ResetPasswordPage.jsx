// ============================================================
// ResetPasswordPage — Set a new password using a reset token
//
// Reached via email link: #/platform/reset-password/:token
// User enters new password + confirmation, submits to backend.
// ============================================================

import { useState } from 'react'
import { resetPassword } from '../../platform-api.js'

export default function ResetPasswordPage({ token, onComplete, onCancel }) {
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const passwordsMatch = form.newPassword === form.confirmPassword
  const canSubmit = form.newPassword.length >= 8 && passwordsMatch

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await resetPassword({ token, newPassword: form.newPassword })
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Failed to reset password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        {success ? (
          <div className="bg-white rounded-2xl shadow-sm border p-8 text-center space-y-4">
            <div className="text-4xl">&#x2705;</div>
            <h1 className="text-xl font-bold text-gray-900">Password Reset Complete</h1>
            <p className="text-sm text-gray-600">
              Your password has been updated. You can now sign in with your new password.
            </p>
            <button
              onClick={onComplete}
              className="w-full bg-sky-600 text-white py-2.5 rounded-lg font-medium hover:bg-sky-700 transition-colors mt-4"
            >
              Go to Sign In
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Set New Password</h1>
              <p className="text-gray-500 text-sm">
                Enter your new password below.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={form.newPassword}
                  onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  autoFocus
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                />
                {form.newPassword.length > 0 && form.newPassword.length < 8 && (
                  <p className="text-xs text-amber-600 mt-1">Minimum 8 characters</p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  required
                  autoComplete="new-password"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                />
                {form.confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                )}
              </div>
              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="w-full bg-sky-600 text-white py-2.5 rounded-md font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>

            <p className="text-xs text-gray-400 text-center mt-6">
              <button onClick={onCancel} className="text-sky-600 hover:underline">
                Back to Sign in
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

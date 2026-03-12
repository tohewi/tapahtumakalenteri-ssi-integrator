// ============================================================
// ForgotPasswordPage — Request password reset email
//
// User enters their email address. Backend sends a reset link
// if the account exists (no user enumeration — always shows success).
// ============================================================

import { useState } from 'react'
import { forgotPassword } from '../../platform-api.js'
import { usePlatformT } from '../../platform-i18n.jsx'

export default function ForgotPasswordPage({ onBack }) {
  const { t } = usePlatformT()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      await forgotPassword({ email: email.trim() })
      setSent(true)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="text-lg font-bold text-sky-700">{t('appName')}</div>
          <button onClick={onBack} className="text-sm text-sky-600 hover:text-sky-700 font-medium">
            {t('forgotPasswordBackToSignIn')}
          </button>
        </div>
      </header>

      <div className="max-w-sm mx-auto px-4 py-16">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('forgotPasswordTitle')}</h1>
          <p className="text-gray-500 text-sm">
            {t('forgotPasswordSubtitle')}
          </p>
        </div>

        {sent ? (
          <div className="bg-white rounded-lg border p-6 text-center space-y-4">
            <div className="text-4xl">📧</div>
            <h2 className="text-lg font-semibold text-gray-900">{t('forgotPasswordCheckEmail')}</h2>
            <p className="text-sm text-gray-600">
              {t('forgotPasswordSentMessage', email)}
            </p>
            <p className="text-xs text-gray-400">
              {t('forgotPasswordSpamNote')}
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="text-sm text-sky-600 hover:text-sky-800"
              >
                {t('forgotPasswordTryDifferent')}
              </button>
              <button
                onClick={onBack}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                {t('forgotPasswordBackToSignIn')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                  {t('forgotPasswordEmailLabel')}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={sending || !email.trim()}
                className="w-full bg-sky-600 text-white py-2.5 rounded-md font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? t('forgotPasswordSending') : t('forgotPasswordSendLink')}
              </button>
            </form>

            <p className="text-xs text-gray-400 text-center mt-6">
              {t('forgotPasswordRemember')}{' '}
              <button onClick={onBack} className="text-sky-600 hover:underline">
                {t('signInTitle')}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

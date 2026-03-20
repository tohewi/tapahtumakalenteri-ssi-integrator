// ============================================================
// SignInPage — Platform owner sign-in form
// ============================================================

import { useState } from 'react'
import { usePlatformT } from '../../platform-i18n.jsx'

export default function SignInPage({ error, onLogin, onSwitchToSignUp, onForgotPassword }) {
  const { t } = usePlatformT()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState(null)

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLocalError(null)
    setLoading(true)
    try {
      await onLogin(form)
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
          <div className="text-lg font-bold text-sky-700">{t('appName')}</div>
          <button
            onClick={onSwitchToSignUp}
            className="text-sm text-sky-600 hover:text-sky-700 font-medium"
          >
            {t('signInCreateAccount')}
          </button>
        </div>
      </header>

      <div className="max-w-sm mx-auto px-4 py-16">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('signInTitle')}</h1>
          <p className="text-gray-500 text-sm">
            {t('signInSubtitle')}
          </p>
        </div>

        {displayError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
            {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-4">
          <div>
            <label htmlFor="signin-email" className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
              {t('signInEmail')}
            </label>
            <input
              id="signin-email"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
              autoFocus
              className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="signin-password" className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
              {t('signInPassword')}
            </label>
            <input
              id="signin-password"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
              className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
            />
            {onForgotPassword && (
              <div className="text-right mt-1">
                <button type="button" onClick={onForgotPassword} className="text-xs text-sky-600 hover:underline">
                  {t('signInForgotPassword')}
                </button>
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sky-600 text-white py-2.5 rounded-md font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? t('signInSubmitting') : t('signInSubmit')}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          {t('signInNoAccount')}{' '}
          <button onClick={onSwitchToSignUp} className="text-sky-600 hover:underline">
            {t('signInCreateOne')}
          </button>
        </p>
      </div>
    </div>
  )
}

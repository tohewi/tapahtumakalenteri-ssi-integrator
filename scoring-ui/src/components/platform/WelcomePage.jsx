// ============================================================
// WelcomePage — Landing page with feature overview + sign-up form
// Shown to unauthenticated users at #/platform
// ============================================================

import { useState } from 'react'
import { usePlatformT } from '../../platform-i18n.jsx'

export default function WelcomePage({ error, onRegister, onSwitchToSignIn }) {
  const { t } = usePlatformT()
  const [form, setForm] = useState({ email: '', password: '', name: '', organizationName: '' })
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
      await onRegister(form)
    } catch (err) {
      setLocalError(err.details ? err.details.join('. ') : err.message)
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
            onClick={onSwitchToSignIn}
            className="text-sm text-sky-600 hover:text-sky-700 font-medium"
          >
            {t('welcomeSignIn')}
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            {t('welcomeTitle')}
          </h1>
          <p className="text-gray-500 text-lg">
            {t('welcomeSubtitle')}
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-white rounded-lg border p-5 text-left">
            <div className="text-2xl mb-2">📋</div>
            <h3 className="font-semibold mb-1">{t('welcomeFeatureTemplates')}</h3>
            <p className="text-sm text-gray-500">
              {t('welcomeFeatureTemplatesDesc')}
            </p>
          </div>
          <div className="bg-white rounded-lg border p-5 text-left">
            <div className="text-2xl mb-2">📅</div>
            <h3 className="font-semibold mb-1">{t('welcomeFeatureScheduling')}</h3>
            <p className="text-sm text-gray-500">
              {t('welcomeFeatureSchedulingDesc')}
            </p>
          </div>
          <div className="bg-white rounded-lg border p-5 text-left">
            <div className="text-2xl mb-2">👥</div>
            <h3 className="font-semibold mb-1">{t('welcomeFeatureRoster')}</h3>
            <p className="text-sm text-gray-500">
              {t('welcomeFeatureRosterDesc')}
            </p>
          </div>
        </div>

        {/* Sign-up form */}
        <div className="bg-sky-50 border border-sky-200 rounded-lg p-8 mb-8">
          <h2 className="text-xl font-bold text-center mb-2">{t('welcomeTrialTitle')}</h2>
          <p className="text-gray-600 text-center mb-6">
            {t('welcomeTrialSubtitle')}
          </p>

          {displayError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
              {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="max-w-sm mx-auto space-y-3">
            <div>
              <label htmlFor="reg-org" className="sr-only">Organization name</label>
              <input
                id="reg-org"
                type="text"
                name="organizationName"
                aria-label={t('welcomeOrgPlaceholder')}
                placeholder={t('welcomeOrgPlaceholder')}
                value={form.organizationName}
                onChange={handleChange}
                required
                minLength={2}
                maxLength={100}
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="reg-name" className="sr-only">Your name</label>
              <input
                id="reg-name"
                type="text"
                name="name"
                aria-label={t('welcomeNamePlaceholder')}
                placeholder={t('welcomeNamePlaceholder')}
                value={form.name}
                onChange={handleChange}
                required
                minLength={2}
                maxLength={100}
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="reg-email" className="sr-only">Email address</label>
              <input
                id="reg-email"
                type="email"
                name="email"
                aria-label={t('welcomeEmailPlaceholder')}
                placeholder={t('welcomeEmailPlaceholder')}
                value={form.email}
                onChange={handleChange}
                required
                maxLength={254}
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="reg-password" className="sr-only">Password</label>
              <input
                id="reg-password"
                type="password"
                name="password"
                aria-label={t('welcomePasswordPlaceholder')}
                placeholder={t('welcomePasswordPlaceholder')}
                value={form.password}
                onChange={handleChange}
                required
                minLength={8}
                maxLength={128}
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sky-600 text-white py-2.5 rounded-md font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? t('welcomeCreating') : t('welcomeCreateAccount')}
            </button>
          </form>
        </div>

        <p className="text-xs text-gray-400 text-center">
          {t('welcomeAlreadyHaveAccount')}{' '}
          <button onClick={onSwitchToSignIn} className="text-sky-600 hover:underline">
            {t('welcomeSignIn')}
          </button>
        </p>
      </div>
    </div>
  )
}

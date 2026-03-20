// ============================================================
// MfaChallengePage — MFA verification during login
//
// Shown after successful email+password login when MFA is enabled.
// User enters a 6-digit TOTP code or a recovery code.
// ============================================================

import { useState } from 'react'
import { mfaVerify } from '../../platform-api.js'
import { usePlatformT } from '../../platform-i18n.jsx'

export default function MfaChallengePage({ onComplete, onCancel }) {
  const { t } = usePlatformT()
  const [code, setCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setVerifying(true)
    setError(null)

    try {
      const params = useRecovery
        ? { recoveryCode: recoveryCode.trim() }
        : { code: code.trim() }

      const data = await mfaVerify(params)

      if (data.success && data.account) {
        onComplete({
          account: data.account,
          tenants: data.tenants || [],
        })
      }
    } catch (err) {
      setError(err.message || 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-white p-8 rounded-2xl shadow-sm border space-y-6">
        <div className="text-center space-y-2">
          <div className="text-4xl">🔐</div>
          <h1 className="text-2xl font-bold text-gray-900">{t('mfaTitle')}</h1>
          <p className="text-sm text-gray-500">
            {useRecovery ? t('mfaRecoveryPrompt') : t('mfaCodePrompt')}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {useRecovery ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('mfaRecoveryCode')}</label>
              <input
                type="text"
                value={recoveryCode}
                onChange={e => setRecoveryCode(e.target.value)}
                placeholder="e.g. a1b2c3d4"
                required
                autoFocus
                autoComplete="off"
                className="w-full border rounded-lg px-4 py-2.5 text-sm font-mono tracking-wider focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-shadow"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('mfaVerificationCode')}</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                required
                autoFocus
                autoComplete="one-time-code"
                className="w-full border rounded-lg px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-shadow"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={verifying || (useRecovery ? !recoveryCode.trim() : code.length !== 6)}
            className="w-full bg-sky-600 text-white py-2.5 rounded-lg font-medium hover:bg-sky-700 disabled:opacity-50 transition-colors"
          >
            {verifying ? t('mfaVerifying') : t('mfaVerify')}
          </button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <button
            onClick={() => { setUseRecovery(!useRecovery); setError(null) }}
            className="text-sky-600 hover:text-sky-800"
          >
            {useRecovery ? t('mfaUseAuthenticator') : t('mfaUseRecovery')}
          </button>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

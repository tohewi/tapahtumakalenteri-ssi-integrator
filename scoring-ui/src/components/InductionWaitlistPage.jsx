import { useEffect, useMemo, useState } from 'react'
import t from '../i18n'
import {
  cancelWaitlistEntry,
  getWaitlistCaptcha,
  submitWaitlistEntry,
  verifyWaitlistCaptcha,
} from '../waitlist-api'

const EQUIPMENT_OPTIONS = [
  { value: 'need-club-22', labelKey: 'waitlistNeedClub22' },
  { value: 'own-pistol', labelKey: 'waitlistOwnPistol' },
]

function initialFormState() {
  return {
    firstName: '',
    lastName: '',
    email: '',
    association: '',
    equipmentChoice: 'need-club-22',
  }
}

export default function InductionWaitlistPage() {
  const [step, setStep] = useState('captcha')
  const [captcha, setCaptcha] = useState(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [form, setForm] = useState(initialFormState)
  const [cancelEmail, setCancelEmail] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadCaptcha()
  }, [])

  async function loadCaptcha() {
    try {
      const challenge = await getWaitlistCaptcha()
      setCaptcha(challenge)
      setCaptchaAnswer('')
    } catch {
      setError(t.waitlistLoadFailed)
    }
  }

  const waitingSummary = useMemo(() => {
    return [
      `${t.waitlistFirstNameLabel}: ${form.firstName || '-'}`,
      `${t.waitlistLastNameLabel}: ${form.lastName || '-'}`,
      `${t.waitlistEmailLabel}: ${form.email || '-'}`,
      `${t.waitlistAssociationLabel}: ${form.association || '-'}`,
      `${t.waitlistEquipmentLabel}: ${t[EQUIPMENT_OPTIONS.find(option => option.value === form.equipmentChoice)?.labelKey || 'waitlistNeedClub22']}`,
    ]
  }, [form])

  async function handleCaptchaSubmit(event) {
    event.preventDefault()
    if (!captcha?.id || !captchaAnswer.trim()) return

    setLoading(true)
    setError(null)
    try {
      await verifyWaitlistCaptcha(captcha.id, captchaAnswer)
      setStep('details')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!captcha?.id) return

    setLoading(true)
    setError(null)
    try {
      const response = await submitWaitlistEntry({
        ...form,
        preferredLanguage: t.waitlistLanguageCode,
        captchaId: captcha.id,
        captchaAnswer,
      })
      setResult({
        type: 'registered',
        entry: response.entry,
      })
      setStep('result')
    } catch (err) {
      if (err.message?.includes('Varmistus') || err.message?.includes('captcha') || err.status === 400) {
        setStep('captcha')
        loadCaptcha()
      }
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancelEntry(event) {
    event.preventDefault()
    if (!cancelEmail.trim()) return

    setLoading(true)
    setError(null)
    try {
      const response = await cancelWaitlistEntry(cancelEmail.trim())
      setResult({ type: 'cancelled', entry: response.entry })
      setStep('result')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setForm(initialFormState())
    setCancelEmail('')
    setResult(null)
    setError(null)
    setStep('captcha')
    loadCaptcha()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-emerald-700 to-teal-900 text-white px-4 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-bold">{t.waitlistTitle}</h1>
            <p className="text-emerald-100 text-sm mt-1">{t.waitlistSubtitle}</p>
          </div>
          <a href="#/" className="text-emerald-100 text-sm active:text-white">
            {t.home}
          </a>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="bg-white border border-emerald-100 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">{t.waitlistHeroTitle}</h2>
          <p className="text-sm text-gray-600 mt-2">{t.waitlistHeroBody}</p>
          <p className="text-sm text-gray-600 mt-2">{t.waitlistThresholdHint}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {step === 'captcha' && captcha && (
          <form onSubmit={handleCaptchaSubmit} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">{t.waitlistCaptchaTitle}</h2>
            <p className="text-sm text-gray-600 mt-1">{t.waitlistCaptchaBody}</p>
            <div className="mt-4 bg-emerald-50 rounded-xl px-4 py-5 text-center text-2xl font-mono font-bold text-emerald-800">
              {captcha.question}
            </div>
            <input
              type="number"
              inputMode="numeric"
              value={captchaAnswer}
              onChange={(event) => setCaptchaAnswer(event.target.value)}
              placeholder={t.waitlistCaptchaPlaceholder}
              className="w-full mt-4 border border-gray-300 rounded-xl px-4 py-3 text-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={loading || !captchaAnswer.trim()}
              className="w-full mt-4 py-3 bg-emerald-600 text-white rounded-xl font-semibold disabled:bg-gray-300 disabled:text-gray-500"
            >
              {loading ? t.loading : t.waitlistContinue}
            </button>
          </form>
        )}

        {step === 'details' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">{t.waitlistFormTitle}</h2>
              <p className="text-sm text-gray-600 mt-1">{t.waitlistFormBody}</p>

              <div className="grid gap-3 mt-4 sm:grid-cols-2">
                <LabeledField label={t.waitlistFirstNameLabel}>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(event) => setForm(current => ({ ...current, firstName: event.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </LabeledField>
                <LabeledField label={t.waitlistLastNameLabel}>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(event) => setForm(current => ({ ...current, lastName: event.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </LabeledField>
              </div>

              <div className="grid gap-3 mt-3 sm:grid-cols-2">
                <LabeledField label={t.waitlistEmailLabel}>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm(current => ({ ...current, email: event.target.value }))}
                    placeholder="name@example.com"
                    className="w-full border border-gray-300 rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </LabeledField>
                <LabeledField label={t.waitlistAssociationLabel}>
                  <input
                    type="text"
                    value={form.association}
                    onChange={(event) => setForm(current => ({ ...current, association: event.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </LabeledField>
              </div>

              <fieldset className="mt-4">
                <legend className="text-sm font-medium text-gray-700 mb-2">{t.waitlistEquipmentLabel}</legend>
                <div className="space-y-2">
                  {EQUIPMENT_OPTIONS.map(option => (
                    <label key={option.value} className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer">
                      <input
                        type="radio"
                        name="equipmentChoice"
                        value={option.value}
                        checked={form.equipmentChoice === option.value}
                        onChange={(event) => setForm(current => ({ ...current, equipmentChoice: event.target.value }))}
                        className="mt-1"
                      />
                      <span className="text-sm text-gray-800">{t[option.labelKey]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">
                {t.waitlistSsiEmailHint}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900">{t.waitlistSummaryTitle}</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                {waitingSummary.map(line => <li key={line}>{line}</li>)}
              </ul>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('captcha')}
                  className="flex-1 py-3 bg-gray-200 text-gray-800 rounded-xl font-medium"
                >
                  {t.back}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold disabled:bg-gray-300 disabled:text-gray-500"
                >
                  {loading ? t.waitlistSubmitting : t.waitlistSubmit}
                </button>
              </div>
            </div>
          </form>
        )}

        {step === 'result' && result && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {result.type === 'registered' ? t.waitlistSuccessTitle : t.waitlistCancelSuccessTitle}
              </h2>
              <p className="text-sm text-gray-600 mt-2">
                {result.type === 'registered' ? t.waitlistSuccessBody : t.waitlistCancelSuccessBody}
              </p>
            </div>
            <button onClick={handleReset} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold">
              {t.waitlistNewEntry}
            </button>
          </div>
        )}

        <form onSubmit={handleCancelEntry} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">{t.waitlistCancelTitle}</h2>
          <p className="text-sm text-gray-600 mt-1">{t.waitlistCancelBody}</p>
          <input
            type="email"
            value={cancelEmail}
            onChange={(event) => setCancelEmail(event.target.value)}
            placeholder="name@example.com"
            className="w-full mt-4 border border-gray-300 rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={loading || !cancelEmail.trim()}
            className="w-full mt-4 py-3 bg-gray-900 text-white rounded-xl font-semibold disabled:bg-gray-300 disabled:text-gray-500"
          >
            {loading ? t.loading : t.waitlistCancelButton}
          </button>
        </form>
      </div>
    </div>
  )
}

function LabeledField({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  )
}
import { useState, useEffect, useCallback } from 'react'
import * as regApi from '../register-api'
import { formatDate, BackButton, CupList } from './shared'

// Steps: captcha → cups → squads → email → submitting → result
const STEPS = ['captcha', 'cups', 'squads', 'email', 'submitting', 'result']

export default function RegisterPage() {
  const [step, setStep] = useState('captcha')
  const [error, setError] = useState(null)

  // Captcha
  const [captcha, setCaptcha] = useState(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')

  // Cup selection
  const [cups, setCups] = useState([])
  const [selectedCup, setSelectedCup] = useState(null)
  const [cupDetail, setCupDetail] = useState(null)

  // Squad selection
  const [selectedSquad, setSelectedSquad] = useState(null)

  // Email
  const [email, setEmail] = useState('')

  // Result
  const [result, setResult] = useState(null)

  // Progress during submission
  const [progress, setProgress] = useState(null) // { current, total, message }

  // Loading state
  const [loading, setLoading] = useState(false)

  // Load captcha on mount
  useEffect(() => {
    loadCaptcha()
  }, [])

  const loadCaptcha = async () => {
    try {
      const c = await regApi.getCaptcha()
      setCaptcha(c)
      setCaptchaAnswer('')
    } catch {
      setError('Palvelua ei voitu ladata. Yritä myöhemmin.')
    }
  }

  // Verify captcha server-side, then load cups (or skip ahead if returning from captcha expiry)
  const handleCaptchaSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!captchaAnswer.trim()) return
    setError(null)
    setLoading(true)

    try {
      // Verify captcha answer server-side BEFORE proceeding
      await regApi.verifyCaptcha(captcha.id, captchaAnswer)

      // If we already have selections (returning from captcha expiry), skip straight to email
      if (selectedCup && selectedSquad && email) {
        setStep('email')
        setLoading(false)
        return
      }

      const cupList = await regApi.getCups()
      if (cupList.length === 0) {
        setError('Ei avoimia ilmoittautumisia tällä hetkellä.')
        setLoading(false)
        return
      }
      setCups(cupList)
      setStep('cups')
    } catch (err) {
      setError(err.data?.error || err.message)
    }
    setLoading(false)
  }, [captcha, captchaAnswer, selectedCup, selectedSquad, email])

  // Select cup and load squads
  const handleSelectCup = useCallback(async (cup) => {
    setError(null)
    setLoading(true)
    setSelectedCup(cup)
    try {
      const detail = await regApi.getCupDetail(cup.id)
      setCupDetail(detail)
      setStep('squads')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [])

  // Select squad → move to email
  const handleSelectSquad = useCallback((squad) => {
    setSelectedSquad(squad)
    setStep('email')
  }, [])

  // Submit registration
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setError(null)
    setProgress(null)
    setStep('submitting')

    try {
      const res = await regApi.submitRegistration({
        cupId: selectedCup.id,
        squadNumber: selectedSquad.number,
        email: email.trim(),
        captchaId: captcha.id,
        captchaAnswer: Number(captchaAnswer),
      }, (evt) => {
        setProgress({ current: evt.current, total: evt.total, message: evt.message })
      })
      setResult(res)
      setStep('result')
    } catch (err) {
      if (err.data?.error === 'user_not_found') {
        setResult({
          success: false,
          message: err.data.message,
          registerUrl: err.data.registerUrl,
        })
        setStep('result')
      } else if (err.message?.includes('vanhentunut') || err.data?.error?.includes('vanhentunut')) {
        // Captcha expired — go back to captcha step, preserve selections, auto-load new captcha
        setCaptchaAnswer('')
        setError('Varmistus vanhentui. Vastaa uudelleen niin jatketaan siitä mihin jäätiin.')
        loadCaptcha()
        setStep('captcha')
      } else {
        setError(err.message || 'Ilmoittautuminen epäonnistui.')
        setStep('email')
      }
    }
  }, [email, selectedCup, selectedSquad, captcha, captchaAnswer])

  // Reset everything
  const handleReset = () => {
    setStep('captcha')
    setError(null)
    setCaptchaAnswer('')
    setSelectedCup(null)
    setCupDetail(null)
    setSelectedSquad(null)
    setEmail('')
    setResult(null)
    loadCaptcha()
  }

  // Go back one step
  const handleBack = () => {
    setError(null)
    const idx = STEPS.indexOf(step)
    if (idx > 0) setStep(STEPS[idx - 1])
  }

  // Progress step index
  const stepIdx = STEPS.indexOf(step)
  const progressLabels = ['Varmistus', 'Cup', 'Squad', 'Sähköposti']

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header — same gradient as scoring */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white">
        {stepIdx > 0 && stepIdx < 4 && (
          <BackButton label={progressLabels[stepIdx - 1]} onClick={handleBack} />
        )}
        <div className="px-4 py-3">
          <h1 className="text-xl font-bold">Kupittaa Cup — Ilmoittautuminen</h1>
          <p className="text-blue-200 text-sm mt-0.5">TurRes reservilaisammunta</p>
        </div>
      </div>

      {/* Progress bar — sticky like scoring series tabs */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex">
          {progressLabels.map((label, i) => {
            const done = stepIdx > i
            const active = stepIdx === i
            return (
              <div key={label} className="flex-1 text-center py-2">
                <div className={`mx-1 h-1 rounded-full ${done ? 'bg-green-500' : active ? 'bg-blue-600' : 'bg-gray-200'}`} />
                <p className={`text-[10px] mt-0.5 font-medium ${done ? 'text-green-600' : active ? 'text-blue-700' : 'text-gray-400'}`}>
                  {label}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-3">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-red-700 text-sm font-medium">{error}</p>
            <button onClick={() => setError(null)} className="text-red-500 text-xs underline mt-1">Sulje</button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-3">

        {/* STEP: Captcha */}
        {step === 'captcha' && captcha && (
          <form onSubmit={handleCaptchaSubmit}>
            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">Varmistus</h2>
              <p className="text-gray-500 text-sm mb-5">Varmista, että olet oikea henkilö.</p>

              <div className="bg-blue-50 rounded-xl p-4 mb-4 text-center">
                <p className="text-2xl font-mono font-bold text-blue-800">{captcha.question}</p>
              </div>

              <input
                type="number"
                inputMode="numeric"
                value={captchaAnswer}
                onChange={e => setCaptchaAnswer(e.target.value)}
                placeholder="Vastaus"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />

              <button
                type="submit"
                disabled={!captchaAnswer.trim() || loading}
                className="w-full mt-4 py-3 bg-blue-600 text-white rounded-xl font-semibold text-lg active:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
              >
                {loading ? 'Ladataan...' : 'Jatka →'}
              </button>
            </div>
          </form>
        )}

        {/* STEP: Cup selection */}
        {step === 'cups' && (
          <CupList cups={cups} onSelect={handleSelectCup} loading={loading} />
        )}

        {/* STEP: Squad selection */}
        {step === 'squads' && cupDetail && (
          <div>
            <div className="mb-3 px-1">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Valitse Squad</h2>
              <p className="text-gray-400 text-xs mt-1">Sama squad kaikissa osakilpailuissa</p>
            </div>

            {cupDetail.squads.map(squad => (
              <button
                key={squad.number}
                onClick={() => !squad.full && handleSelectSquad(squad)}
                disabled={squad.full}
                className={`w-full flex items-center gap-3 p-4 mb-2 rounded-xl border transition-colors text-left ${
                  squad.full
                    ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
                    : 'bg-white border-gray-200 active:bg-blue-50'
                }`}
              >
                {/* Number badge */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold text-lg ${
                  squad.full ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-700'
                }`}>
                  {squad.number}
                </div>

                {/* Squad info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 truncate">{squad.name}</div>
                </div>

                {/* Capacity */}
                <span className={`inline-block px-2 py-1 rounded-lg text-xs font-medium shrink-0 ${
                  squad.full ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                }`}>
                  {squad.full ? 'TÄYNNÄ' : `${squad.current}/${squad.max}`}
                </span>

                {/* Arrow */}
                {!squad.full && (
                  <div className="text-gray-300 shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* STEP: Email */}
        {step === 'email' && (
          <form onSubmit={handleSubmit}>
            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">Sähköpostiosoite</h2>
              <p className="text-gray-500 text-sm mb-4">
                Syötä SSI-tilisi sähköpostiosoite (ShootNScoreIt).
              </p>

              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm space-y-1">
                <p><span className="text-gray-500">Cup:</span> <span className="font-medium">{selectedCup?.name}</span></p>
                <p><span className="text-gray-500">Päivä:</span> {formatDate(selectedCup?.starts)}</p>
                <p><span className="text-gray-500">Squad:</span> <span className="font-medium">{selectedSquad?.name}</span></p>
              </div>

              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nimi@esimerkki.fi"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
                required
              />

              <button
                type="submit"
                disabled={!email.trim()}
                className="w-full mt-4 py-3 bg-blue-600 text-white rounded-xl font-semibold text-lg active:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
              >
                Ilmoittaudu
              </button>
            </div>
          </form>
        )}

        {/* STEP: Submitting */}
        {step === 'submitting' && (
          <div className="bg-white rounded-xl border p-8 text-center">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-700 font-medium">Ilmoittautuminen käynnissä...</p>
            {progress && progress.total > 0 ? (
              <div className="mt-4">
                {/* Progress bar */}
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(10, (progress.current / progress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-blue-700 font-semibold text-sm">
                  {progress.message}
                </p>
              </div>
            ) : (
              <p className="text-gray-400 text-sm mt-2">Tämä voi kestää hetken.</p>
            )}
          </div>
        )}

        {/* STEP: Result */}
        {step === 'result' && result && (
          <div className="bg-white rounded-xl border p-5">
            {result.success ? (
              <>
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-green-700">
                    {result.isReRegistration ? 'Squad päivitetty!' : 'Ilmoittautuminen onnistui!'}
                  </h2>
                </div>
                <p className="text-gray-600 text-center text-sm mb-4">{result.message}</p>
                <div className="bg-green-50 rounded-xl p-3 text-sm space-y-1">
                  <p><span className="text-gray-500">Cup:</span> <span className="font-medium">{selectedCup?.name}</span></p>
                  <p><span className="text-gray-500">Päivä:</span> {formatDate(selectedCup?.starts)}</p>
                  <p><span className="text-gray-500">Squad:</span> <span className="font-medium">{selectedSquad?.name}</span></p>
                  <p><span className="text-gray-500">Sähköposti:</span> {email}</p>
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-red-700">Ilmoittautuminen ei onnistunut</h2>
                </div>
                <p className="text-gray-600 text-center text-sm mb-4">{result.message}</p>
                {result.registerUrl && (
                  <a
                    href={result.registerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center py-3 bg-blue-600 text-white rounded-xl font-semibold active:bg-blue-700 transition-colors mb-3"
                  >
                    Rekisteröidy SSI-palveluun →
                  </a>
                )}
              </>
            )}

            <button
              onClick={handleReset}
              className="w-full mt-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold text-base active:bg-gray-300"
            >
              Uusi ilmoittautuminen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

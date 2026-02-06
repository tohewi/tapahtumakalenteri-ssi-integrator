import { useState, useEffect, useCallback } from 'react'
import * as regApi from '../register-api'

// Format date for Finnish display
function formatDate(isoDate) {
  if (!isoDate) return ''
  const d = new Date(isoDate)
  return d.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

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

  // Verify captcha and load cups
  const handleCaptchaSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!captchaAnswer.trim()) return
    setError(null)
    setLoading(true)

    try {
      const cupList = await regApi.getCups()
      if (cupList.length === 0) {
        setError('Ei avoimia ilmoittautumisia tällä hetkellä.')
        setLoading(false)
        return
      }
      setCups(cupList)
      setStep('cups')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [captchaAnswer])

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
    setStep('submitting')

    try {
      const res = await regApi.submitRegistration({
        cupId: selectedCup.id,
        squadNumber: selectedSquad.number,
        email: email.trim(),
        captchaId: captcha.id,
        captchaAnswer: Number(captchaAnswer),
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <div className="bg-blue-700 text-white py-4 px-4 shadow-md">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold">Kupittaa Cup — Ilmoittautuminen</h1>
          <p className="text-blue-200 text-sm mt-1">TurRes reservilaisammunta</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="flex gap-1 mb-6">
          {['Varmistus', 'Cup', 'Squad', 'Sähköposti'].map((label, i) => {
            const stepIdx = STEPS.indexOf(step)
            const active = stepIdx >= i
            return (
              <div key={label} className="flex-1">
                <div className={`h-1.5 rounded-full ${active ? 'bg-blue-600' : 'bg-gray-200'}`} />
                <p className={`text-xs mt-1 ${active ? 'text-blue-700 font-medium' : 'text-gray-400'}`}>{label}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-lg mx-auto px-4 mb-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 pb-8">

        {/* STEP: Captcha */}
        {step === 'captcha' && captcha && (
          <form onSubmit={handleCaptchaSubmit} className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Varmistus</h2>
            <p className="text-gray-500 text-sm mb-6">Varmista, että olet oikea henkilö.</p>

            <div className="bg-blue-50 rounded-lg p-4 mb-4 text-center">
              <p className="text-2xl font-mono font-bold text-blue-800">{captcha.question}</p>
            </div>

            <input
              type="number"
              inputMode="numeric"
              value={captchaAnswer}
              onChange={e => setCaptchaAnswer(e.target.value)}
              placeholder="Vastaus"
              className="w-full border rounded-lg px-4 py-3 text-lg text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              autoFocus
            />

            <button
              type="submit"
              disabled={!captchaAnswer.trim() || loading}
              className="w-full mt-4 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Ladataan...' : 'Jatka'}
            </button>
          </form>
        )}

        {/* STEP: Cup selection */}
        {step === 'cups' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800">Valitse Cup</h2>
            <p className="text-gray-500 text-sm mb-2">Valitse Cup, johon haluat ilmoittautua.</p>

            {cups.map(cup => (
              <button
                key={cup.id}
                onClick={() => !cup.full && handleSelectCup(cup)}
                disabled={cup.full || loading}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  cup.full
                    ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
                    : 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-md active:bg-blue-50'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-800">{cup.name}</p>
                    <p className="text-sm text-gray-500 mt-1">{formatDate(cup.starts)}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      cup.full
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {cup.full ? 'TÄYNNÄ' : `${cup.registered}/${cup.maxCompetitors}`}
                    </span>
                  </div>
                </div>
              </button>
            ))}

            <button onClick={handleBack} className="text-sm text-gray-400 hover:text-gray-600 mt-2">
              ← Takaisin
            </button>
          </div>
        )}

        {/* STEP: Squad selection */}
        {step === 'squads' && cupDetail && (
          <div className="space-y-3">
            <div className="mb-2">
              <h2 className="text-lg font-semibold text-gray-800">Valitse Squad</h2>
              <p className="text-sm text-blue-600 font-medium">{cupDetail.name}</p>
              <p className="text-gray-500 text-sm">{formatDate(cupDetail.starts)}</p>
              <p className="text-gray-400 text-xs mt-1">Sama squad kaikissa osakilpailuissa.</p>
            </div>

            {cupDetail.squads.map(squad => (
              <button
                key={squad.number}
                onClick={() => !squad.full && handleSelectSquad(squad)}
                disabled={squad.full}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  squad.full
                    ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
                    : 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-md active:bg-blue-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-gray-800">{squad.name}</p>
                  </div>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                    squad.full
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {squad.full ? 'TÄYNNÄ' : `${squad.current}/${squad.max}`}
                  </span>
                </div>
              </button>
            ))}

            <button onClick={handleBack} className="text-sm text-gray-400 hover:text-gray-600 mt-2">
              ← Takaisin
            </button>
          </div>
        )}

        {/* STEP: Email */}
        {step === 'email' && (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Sähköpostiosoite</h2>
            <p className="text-gray-500 text-sm mb-4">
              Syötä SSI-tilisi sähköpostiosoite (ShootNScoreIt).
            </p>

            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <p><span className="text-gray-500">Cup:</span> <span className="font-medium">{selectedCup?.name}</span></p>
              <p><span className="text-gray-500">Päivä:</span> {formatDate(selectedCup?.starts)}</p>
              <p><span className="text-gray-500">Squad:</span> <span className="font-medium">{selectedSquad?.name}</span></p>
            </div>

            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nimi@esimerkki.fi"
              className="w-full border rounded-lg px-4 py-3 text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              autoFocus
              required
            />

            <button
              type="submit"
              disabled={!email.trim()}
              className="w-full mt-4 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Ilmoittaudu
            </button>

            <button type="button" onClick={handleBack} className="w-full text-sm text-gray-400 hover:text-gray-600 mt-3 py-2">
              ← Takaisin
            </button>
          </form>
        )}

        {/* STEP: Submitting */}
        {step === 'submitting' && (
          <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-700 font-medium">Ilmoittautuminen käynnissä...</p>
            <p className="text-gray-400 text-sm mt-2">Tämä voi kestää hetken.</p>
          </div>
        )}

        {/* STEP: Result */}
        {step === 'result' && result && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            {result.success ? (
              <>
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-green-700">Ilmoittautuminen onnistui!</h2>
                </div>
                <p className="text-gray-600 text-center mb-4">{result.message}</p>
                <div className="bg-green-50 rounded-lg p-3 text-sm mb-4">
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
                <p className="text-gray-600 text-center mb-4">{result.message}</p>
                {result.registerUrl && (
                  <a
                    href={result.registerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors mb-3"
                  >
                    Rekisteröidy SSI-palveluun →
                  </a>
                )}
              </>
            )}

            <button
              onClick={handleReset}
              className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 mt-2"
            >
              Uusi ilmoittautuminen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import * as api from '../api'
import { encryptData, decryptData } from '../crypto'
import LoginScreen from './LoginScreen'

const LS_MANAGE_CREDS = 'ssi_manage_credentials'

function formatDate(isoDate) {
  if (!isoDate) return ''
  const d = new Date(isoDate)
  return d.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function BackButton({ label, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 px-4 pt-2 text-blue-200 text-sm active:text-white">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  )
}

export default function ManagePage() {
  const [authed, setAuthed] = useState(false)
  const [view, setView] = useState('login') // login | cups | overview
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Cup search & selection
  const [searchText, setSearchText] = useState('Kupittaa')
  const [cups, setCups] = useState([])
  const [selectedCup, setSelectedCup] = useState(null)

  // Management data
  const [data, setData] = useState(null)

  // Auto-login on mount
  useEffect(() => {
    const tryAutoLogin = async () => {
      const raw = localStorage.getItem(LS_MANAGE_CREDS)
      if (!raw) return
      const creds = await decryptData(raw)
      if (!creds) return
      try {
        await api.login(creds.email, creds.password, creds.apiKey)
        setAuthed(true)
        setView('cups')
      } catch { /* show login */ }
    }
    tryAutoLogin()
  }, [])

  // Login handler
  const handleLogin = async (email, password, apiKey, rememberMe) => {
    await api.login(email, password, apiKey)
    if (rememberMe) {
      const encrypted = await encryptData({ email, password, apiKey })
      localStorage.setItem(LS_MANAGE_CREDS, encrypted)
    }
    setAuthed(true)
    setView('cups')
  }

  // Search cups
  const handleSearch = useCallback(async () => {
    if (!searchText.trim()) return
    setLoading(true)
    setError(null)
    try {
      const results = await api.searchCups(searchText)
      // Filter to active cups only, sort by date descending
      const filtered = results
        .filter(c => c.status === 'on')
        .sort((a, b) => new Date(b.starts) - new Date(a.starts))
      setCups(filtered)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [searchText])

  // Auto-search on view change
  useEffect(() => {
    if (view === 'cups' && cups.length === 0) handleSearch()
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load management data for selected cup
  const handleSelectCup = useCallback(async (cup) => {
    setSelectedCup(cup)
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/manage/cup/${cup.id}`, { credentials: 'include' })
      if (!resp.ok) throw new Error('Failed to load management data')
      const d = await resp.json()
      setData(d)
      setView('overview')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [])

  // Login screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white px-4 py-3">
          <h1 className="text-xl font-bold">Kupittaa Cup — Hallinta</h1>
          <p className="text-blue-200 text-sm mt-0.5">Kirjaudu SSI-tunnuksilla</p>
        </div>
        <LoginScreen onLogin={handleLogin} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white">
        {view === 'overview' && (
          <BackButton label="Cupit" onClick={() => setView('cups')} />
        )}
        <div className="px-4 py-3">
          <h1 className="text-xl font-bold">Kupittaa Cup — Hallinta</h1>
          {view === 'overview' && selectedCup && (
            <p className="text-blue-200 text-sm mt-0.5">{selectedCup.name}</p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-3">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Cup picker */}
      {view === 'cups' && !loading && (
        <div className="p-3">
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Hae cupia..."
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700"
            >
              Hae
            </button>
          </div>

          {cups.length === 0 && (
            <p className="text-gray-400 text-center text-sm py-4">Ei hakutuloksia</p>
          )}

          {cups.map(cup => (
            <button
              key={cup.id}
              onClick={() => handleSelectCup(cup)}
              className="w-full flex items-center gap-3 p-4 mb-2 rounded-xl border bg-white border-gray-200 active:bg-blue-50 text-left"
            >
              <div className="w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 bg-blue-100 text-blue-700">
                <span className="text-xs font-medium leading-none">
                  {new Date(cup.starts).toLocaleDateString('fi-FI', { weekday: 'short' })}
                </span>
                <span className="text-lg font-bold leading-tight">
                  {new Date(cup.starts).getDate()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800 truncate">{cup.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{formatDate(cup.starts)}</div>
              </div>
              <svg className="w-5 h-5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* Squadding overview */}
      {view === 'overview' && data && !loading && (
        <SquaddingOverview data={data} />
      )}
    </div>
  )
}

// ============================================================
// Squadding Overview Component
// ============================================================

function SquaddingOverview({ data }) {
  const { matches, shooters, cupOnly, matchOnly } = data
  const matchIds = matches.map(m => m.id)
  const totalMatches = matches.length

  // Short match names (extract last word: Tarkkuus, Pika, Kuvio)
  const matchLabels = matches.map(m => {
    const parts = m.name.split(' ')
    return parts[parts.length - 1]
  })

  // Get unique squad numbers
  const squadNumbers = [...new Set(matches.flatMap(m => m.squads.map(s => s.number)))].sort((a, b) => a - b)

  // Group shooters by their squad assignment
  // A shooter is "consistent" if they have the same squad in all matches
  const squadGroups = squadNumbers.map(sqNum => {
    const inThisSquad = shooters.filter(s => {
      return Object.values(s.matches).some(n => n === sqNum)
    })

    return {
      number: sqNum,
      name: matches[0]?.squads.find(s => s.number === sqNum)?.name || `Squad ${sqNum}`,
      max: matches[0]?.squads.find(s => s.number === sqNum)?.max || 0,
      shooters: inThisSquad.map(s => {
        const assignments = matchIds.map(id => s.matches[id] ?? null)
        const allSame = assignments.every(a => a === sqNum)
        const missingFromMatches = assignments.filter(a => a === null).length
        return {
          name: s.name,
          assignments,
          consistent: allSame && missingFromMatches === 0,
          missingFromMatches,
          primarySquad: sqNum,
        }
      }).sort((a, b) => a.name.localeCompare(b.name, 'fi')),
    }
  })

  // Unsquadded = in CUP but not in any match squad
  const hasIssues = cupOnly.length > 0 || matchOnly.length > 0 ||
    shooters.some(s => Object.keys(s.matches).length < totalMatches)

  return (
    <div className="p-3 space-y-4">

      {/* Summary badges */}
      <div className="flex gap-2 flex-wrap">
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          {shooters.length} ampujaa
        </span>
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          {matches.length} osakilpailua
        </span>
        {hasIssues && (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            Huomioita
          </span>
        )}
      </div>

      {/* Per-squad tables */}
      {squadGroups.map(group => (
        <div key={group.number} className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">{group.name}</h3>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              group.shooters.length >= group.max ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}>
              {group.shooters.length}/{group.max}
            </span>
          </div>

          {group.shooters.length === 0 ? (
            <p className="px-4 py-3 text-gray-400 text-sm">Ei ampujia</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-2 font-medium text-gray-500">Ampuja</th>
                  {matchLabels.map((label, i) => (
                    <th key={i} className="text-center px-2 py-2 font-medium text-gray-500 w-16">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.shooters.map((shooter, idx) => (
                  <tr key={idx} className={`border-b last:border-0 ${!shooter.consistent ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-2 text-gray-800">{shooter.name}</td>
                    {shooter.assignments.map((sqNum, i) => (
                      <td key={i} className="text-center px-2 py-2">
                        {sqNum === null ? (
                          <span className="text-red-500 font-bold">✗</span>
                        ) : sqNum === shooter.primarySquad ? (
                          <span className="text-green-600">✓</span>
                        ) : (
                          <span className="text-amber-600 font-medium">S{sqNum}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {/* CUP-only participants (not in any match) */}
      {cupOnly.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b">
            <h3 className="font-semibold text-red-800">Cupissa mutta ei osakilpailuissa</h3>
            <p className="text-red-600 text-xs mt-0.5">Nämä ampujat ovat ilmoittautuneet cupiin mutta puuttuvat osakilpailuista</p>
          </div>
          <ul className="divide-y">
            {cupOnly.map((name, i) => (
              <li key={i} className="px-4 py-2 text-sm text-gray-800">{name}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Match-only participants (not in CUP) */}
      {matchOnly.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b">
            <h3 className="font-semibold text-amber-800">Osakilpailuissa mutta ei cupissa</h3>
            <p className="text-amber-600 text-xs mt-0.5">Nämä ampujat ovat osakilpailuissa mutta puuttuvat cup-ilmoittautumisesta</p>
          </div>
          <ul className="divide-y">
            {matchOnly.map((name, i) => (
              <li key={i} className="px-4 py-2 text-sm text-gray-800">{name}</li>
            ))}
          </ul>
        </div>
      )}

      {/* All OK */}
      {!hasIssues && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-green-700 font-medium">Kaikki kunnossa</p>
          <p className="text-green-600 text-xs mt-1">Kaikki ampujat ovat kaikissa osakilpailuissa ja squadeissa</p>
        </div>
      )}
    </div>
  )
}

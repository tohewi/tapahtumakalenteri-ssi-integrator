import { useState, useEffect, useCallback } from 'react'
import * as api from '../api'
import { encryptData, decryptData } from '../crypto'
import LoginScreen from './LoginScreen'
import { AppHeader } from './shared'
import t from '../i18n'
import { fetchStaffingEvents, staffSignup, staffResign } from '../staffing-api'

const LS_CREDS = 'ssi_credentials'

export default function StaffingPage() {
  const [authed, setAuthed] = useState(false)
  const [events, setEvents] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [userEmail, setUserEmail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null)

  // Saved credentials for pre-fill
  const [savedEmail, setSavedEmail] = useState('')
  const [savedPassword, setSavedPassword] = useState('')
  const [savedApiKey, setSavedApiKey] = useState('')

  // Load saved credentials for pre-fill
  useEffect(() => {
    const loadSavedCreds = async () => {
      const raw = localStorage.getItem(LS_CREDS)
      if (!raw) return
      const creds = await decryptData(raw)
      if (creds) {
        setSavedEmail(creds.email || '')
        setSavedPassword(creds.password || '')
        setSavedApiKey(creds.apiKey || '')
      }
    }
    loadSavedCreds()
  }, [])

  // Session expiry handler
  const handleSessionExpired = useCallback(() => {
    setSessionExpiredMessage('Session expired. Please login again.')
    setAuthed(false)
  }, [])

  // Login handler — scope: 'staffing', instructor list checked server-side
  const handleLogin = async (email, password, apiKey, rememberMe) => {
    setSessionExpiredMessage(null)
    await api.login(email, password, apiKey, 'staffing')
    if (rememberMe) {
      const encrypted = await encryptData({ email, password, apiKey })
      localStorage.setItem(LS_CREDS, encrypted)
    }
    setAuthed(true)
  }

  // Logout handler
  const handleLogout = async () => {
    try { await api.logout() } catch { /* ignore */ }
    setAuthed(false)
    setEvents([])
    setError(null)
  }

  async function loadEvents() {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchStaffingEvents()
      setEvents(data.events || [])
      setIsAdmin(data.isAdmin || false)
      setUserEmail(data.userEmail || null)
    } catch (err) {
      if (err.sessionExpired || err.status === 403) {
        handleSessionExpired()
        return
      }
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Load events when authenticated
  useEffect(() => {
    if (authed) loadEvents()
  }, [authed]) // eslint-disable-line react-hooks/exhaustive-deps

  // Login screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-slate-700 to-slate-900 text-white px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-xl font-bold">{t.staffingTitle}</h1>
              <p className="text-slate-300 text-sm mt-1">Temppelivuori SRA</p>
            </div>
            <a href="#/" className="text-slate-300 text-sm active:text-white">
              {t.home}
            </a>
          </div>
        </div>
        {sessionExpiredMessage && (
          <div className="mx-4 mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
            <p className="text-yellow-700 text-sm">{sessionExpiredMessage}</p>
          </div>
        )}
        <LoginScreen
          onLogin={handleLogin}
          initialEmail={savedEmail}
          initialPassword={savedPassword}
          initialApiKey={savedApiKey}
          hideHeader
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-slate-700 to-slate-900 text-white px-4 py-5">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-xl font-bold">{t.staffingTitle}</h1>
            <p className="text-slate-300 text-sm mt-1">Temppelivuori SRA</p>
          </div>
          <button onClick={handleLogout} className="text-slate-300 text-sm active:text-white">
            {t.logout}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {loading && (
          <div className="text-center py-8 text-gray-500">{t.loading}</div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="text-center py-8 text-gray-400">{t.noUpcomingEvents}</div>
        )}

        {events.map(evt => (
          <EventCard
            key={evt.eventId}
            event={evt}
            isAdmin={isAdmin}
            userEmail={userEmail}
            onUpdate={loadEvents}
          />
        ))}
      </div>
    </div>
  )
}

function EventCard({ event, isAdmin, userEmail, onUpdate }) {
  const [busy, setBusy] = useState(null) // role being registered/resigned, or null
  const [error, setError] = useState(null)

  const date = new Date(event.eventDate)
  const dateStr = date.toLocaleDateString('fi-FI', {
    weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric'
  })

  // What role does the current user hold in this event?
  const myRole = getUserRole(event, userEmail)

  async function handleRegister(role) {
    try {
      setBusy(role)
      setError(null)
      const result = await staffSignup(event.eventId, role)
      
      // Show SSI integration status
      if (result.ssi) {
        const messages = []
        if (result.ssi.trainerSquad) {
          if (result.ssi.trainerSquad.success) {
            messages.push(`✅ Added to Squad 5 (Trainer Squad)`)
          } else {
            messages.push(`⚠️ Squad 5: ${result.ssi.trainerSquad.message}`)
          }
        }
        if (result.ssi.management) {
          if (result.ssi.management.success) {
            messages.push(`✅ Added to Match Management as ${result.ssi.management.role}`)
          } else {
            messages.push(`⚠️ Management: ${result.ssi.management.message}`)
          }
        }
        if (messages.length > 0) {
          alert(messages.join('\n'))
        }
      }
      
      onUpdate()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleResign() {
    if (!confirm(t.resignConfirm)) return
    try {
      setBusy('resign')
      setError(null)
      const result = await staffResign(event.eventId)
      
      // Show SSI removal status
      if (result.ssi) {
        const messages = []
        if (result.ssi.management) {
          if (result.ssi.management.success) {
            messages.push(`✅ Removed from Match Management`)
          } else {
            messages.push(`⚠️ Management: ${result.ssi.management.message}`)
          }
        }
        if (result.ssi.trainerSquad) {
          if (result.ssi.trainerSquad.success) {
            messages.push(`✅ Removed from Squad 5 (Trainer Squad)`)
          } else {
            messages.push(`⚠️ Squad 5: ${result.ssi.trainerSquad.message}`)
          }
        }
        if (messages.length > 0) {
          alert(messages.join('\n'))
        }
      }
      
      // Show warning if there were issues (in addition to the detailed messages)
      if (result.warning && !result.ssi) {
        alert(result.warning)
      }
      
      onUpdate()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const staffCount = event.staff?.length || 0
  // Max vetäjät slots = maxTrainers - special role slots taken
  const specialsTaken = (event.leadInstructor ? 1 : 0) + (event.equipmentManager ? 1 : 0)
  const maxVetajat = event.maxTrainers - 2 // 2 reserved for special roles
  const vetajatSlots = Math.max(0, event.maxTrainers - specialsTaken - staffCount)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Event header */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-700 to-slate-800 text-white">
        <div className="font-semibold text-sm">{event.eventName}</div>
        <div className="flex items-center gap-3 text-xs text-slate-300 mt-0.5">
          <span>{dateStr}</span>
          <span>·</span>
          <span>{t.shooterCount}: {event.shooterCount}</span>
          {event.isFull && (
            <span className="bg-red-500 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">{t.registrationFull}</span>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-xs">{error}</div>
      )}

      <div className="divide-y divide-gray-100">
        {/* Vastuuvetäjä row */}
        <RoleRow
          label={t.leadInstructor}
          person={event.leadInstructor}
          roleKey="leadInstructor"
          isMe={event.leadInstructor?.email === userEmail}
          canRegister={isAdmin && !myRole && !event.isFull && !event.leadInstructor}
          canResign={event.leadInstructor?.email === userEmail}
          busy={busy}
          onRegister={() => handleRegister('leadInstructor')}
          onResign={handleResign}
        />

        {/* Kalustovastaava row */}
        <RoleRow
          label={t.equipmentManager}
          person={event.equipmentManager}
          roleKey="equipmentManager"
          isMe={event.equipmentManager?.email === userEmail}
          canRegister={isAdmin && !myRole && !event.isFull && !event.equipmentManager}
          canResign={event.equipmentManager?.email === userEmail}
          busy={busy}
          onRegister={() => handleRegister('equipmentManager')}
          onResign={handleResign}
        />

        {/* Vetäjät section */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {t.instructors}
            </span>
            <span className="text-xs text-gray-400">
              {event.currentTrainers}/{event.maxTrainers}
            </span>
          </div>

          {/* Staff list */}
          {staffCount > 0 && (
            <div className="space-y-1 mb-2">
              {event.staff.map(s => (
                <div key={s.email} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">
                    {s.userName}
                    {s.email === userEmail && (
                      <span className="text-blue-500 text-xs ml-1">{t.you}</span>
                    )}
                  </span>
                  {s.email === userEmail && (
                    <button
                      onClick={handleResign}
                      disabled={!!busy}
                      className="text-xs text-red-500 hover:text-red-700 active:text-red-800 disabled:opacity-50 font-medium"
                    >
                      {busy === 'resign' ? '...' : t.resign}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Register as vetäjä button */}
          {isAdmin && !myRole && !event.isFull && (
            <button
              onClick={() => handleRegister('staff')}
              disabled={!!busy}
              className="w-full text-sm bg-green-500 text-white font-medium py-2 rounded-lg active:bg-green-600 disabled:opacity-50 transition-colors"
            >
              {busy === 'staff' ? '...' : t.register}
            </button>
          )}

          {!isAdmin && (
            <div className="text-xs text-gray-400 italic">{t.adminOnly}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function RoleRow({ label, person, roleKey, isMe, canRegister, canResign, busy, onRegister, onResign }) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-28 shrink-0">{label}</span>
        {person ? (
          <span className="text-sm text-gray-800 truncate">
            {person.userName}
            {isMe && <span className="text-blue-500 text-xs ml-1">{t.you}</span>}
          </span>
        ) : (
          <span className="text-sm text-gray-300">—</span>
        )}
      </div>
      <div className="shrink-0 ml-2">
        {canRegister && (
          <button
            onClick={onRegister}
            disabled={!!busy}
            className="text-xs bg-blue-500 text-white px-3 py-1 rounded-full active:bg-blue-600 disabled:opacity-50 font-medium"
          >
            {busy === roleKey ? '...' : t.register}
          </button>
        )}
        {canResign && (
          <button
            onClick={onResign}
            disabled={!!busy}
            className="text-xs text-red-500 hover:text-red-700 active:text-red-800 disabled:opacity-50 font-medium"
          >
            {busy === 'resign' ? '...' : t.resign}
          </button>
        )}
      </div>
    </div>
  )
}

function getUserRole(event, email) {
  if (!email) return null
  if (event.leadInstructor?.email === email) return 'leadInstructor'
  if (event.equipmentManager?.email === email) return 'equipmentManager'
  if (event.staff?.some(s => s.email === email)) return 'staff'
  return null
}

import { useState, useEffect, useCallback } from 'react'
import * as api from '../api'
import { encryptData, decryptData } from '../crypto'
import LoginScreen from './LoginScreen'
import { AppHeader } from './shared'
import t from '../i18n'
import { fetchStaffingEvents, staffSignup, staffResign } from '../staffing-api'

const LS_CREDS = 'ssi_credentials'
const isDev = import.meta.env.DEV

const ROLE_LABELS = {
  leadInstructor: t.leadInstructor,
  equipmentManager: t.equipmentManager,
  staff: t.instructor,
}

// ── Inline banner notification (not a button, not floating) ──
function InlineBanner({ message, type = 'success', onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const styles = {
    success: 'bg-green-50 text-green-700 border-green-200',
    error: 'bg-red-50 text-red-700 border-red-200',
  }
  const icons = {
    success: '✓',
    error: '✗',
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 border-b text-xs ${styles[type] || styles.success}`}>
      <span className="font-bold">{icons[type]}</span>
      <span>{message}</span>
    </div>
  )
}

export default function StaffingPage() {
  const [authed, setAuthed] = useState(false)
  const [events, setEvents] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [userEmail, setUserEmail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'missingRoles' | 'myEvents'

  // Saved credentials for pre-fill
  const [savedEmail, setSavedEmail] = useState('')
  const [savedPassword, setSavedPassword] = useState('')
  const [savedApiKey, setSavedApiKey] = useState('')

  // Check existing session on mount (survives page reload)
  useEffect(() => {
    api.getAuthStatus().then(status => {
      if (status.authenticated) setAuthed(true)
    }).catch(() => {})
  }, [])

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

      {/* Filter chips */}
      {!loading && events.length > 0 && (
        <div className="px-3 pt-3 pb-0 flex gap-2">
          {['all', 'missingRoles', 'myEvents'].map(f => {
            const labels = { all: t.filterAll, missingRoles: t.filterMissingRoles, myEvents: t.filterMyEvents }
            const active = filter === f
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? 'bg-slate-700 text-white'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
              >
                {labels[f]}
              </button>
            )
          })}
        </div>
      )}

      <div className="p-3 space-y-3">
        {loading && (
          <div className="text-center py-8">
            <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-red-700 text-sm">{error}</p>
            <button onClick={() => setError(null)} className="text-red-500 text-xs underline mt-1">{t.dismiss}</button>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="text-center py-8 text-gray-400">{t.noUpcomingEvents}</div>
        )}

        {events
          .filter(evt => {
            if (filter === 'missingRoles') return !evt.leadInstructor || !evt.equipmentManager
            if (filter === 'myEvents') return !!getUserRole(evt, userEmail)
            return true
          })
          .map(evt => (
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

// ============================================================
// Event Card — single CTA with bottom sheet role picker
// ============================================================

function EventCard({ event, isAdmin, userEmail, onUpdate }) {
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState(null) // { message, type }
  const [showRolePicker, setShowRolePicker] = useState(false)

  const date = new Date(event.eventDate)
  const dateStr = date.toLocaleDateString('fi-FI', {
    weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric'
  })

  const myRole = getUserRole(event, userEmail)
  const staffCount = event.staff?.length || 0

  async function handleRegister(role) {
    setShowRolePicker(false)
    try {
      setBusy(true)
      setBanner(null)
      const result = await staffSignup(event.eventId, role)

      if (isDev && result.ssi) {
        console.log('[staffing] SSI signup result:', JSON.stringify(result.ssi, null, 2))
      }

      setBanner({ message: t.registered, type: 'success' })
      onUpdate()
    } catch (err) {
      setBanner({ message: err.message, type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleResign() {
    if (!confirm(t.resignConfirm)) return
    try {
      setBusy(true)
      setBanner(null)
      const result = await staffResign(event.eventId)

      if (isDev && result.ssi) {
        console.log('[staffing] SSI resign result:', JSON.stringify(result.ssi, null, 2))
      }
      if (isDev && result.warning) {
        console.warn('[staffing] SSI warning:', result.warning)
      }

      setBanner({ message: t.resigned, type: 'success' })
      onUpdate()
    } catch (err) {
      setBanner({ message: err.message, type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Event header */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-700 to-slate-800 text-white">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{event.eventName}</span>
          {(!event.leadInstructor || !event.equipmentManager) && (
            <span className="text-amber-400 text-sm" title={t.missingRolesWarning}>⚠</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-300 mt-0.5">
          <span>{dateStr}</span>
          <span>·</span>
          <span>{t.shooterCount}: {event.shooterCount}</span>
          <span>·</span>
          <span>{event.currentTrainers}/{event.maxTrainers}</span>
          {event.isFull && (
            <span className="bg-red-500 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">{t.registrationFull}</span>
          )}
        </div>
      </div>

      {/* Inline banner notification */}
      {banner && (
        <InlineBanner message={banner.message} type={banner.type} onDismiss={() => setBanner(null)} />
      )}

      {/* Role display rows (read-only) */}
      <div className="divide-y divide-gray-100">
        <RoleRow label={t.leadInstructor} person={event.leadInstructor} isMe={event.leadInstructor?.email === userEmail} />
        <RoleRow label={t.equipmentManager} person={event.equipmentManager} isMe={event.equipmentManager?.email === userEmail} />

        {/* Vetäjät list */}
        <div className="px-4 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.instructors}</span>
            <span className="text-xs text-gray-400">{staffCount} / {Math.max(0, event.maxTrainers - (event.leadInstructor ? 1 : 0) - (event.equipmentManager ? 1 : 0))}</span>
          </div>
          {staffCount > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {event.staff.map(s => (
                <div key={s.email} className="text-sm text-gray-700">
                  {s.userName}
                  {s.email === userEmail && <span className="text-blue-500 text-xs ml-1">{t.you}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Single CTA area ── */}
      <div className="px-4 py-3 border-t border-gray-100">
        {busy ? (
          // Progress indicator
          <div className="flex items-center justify-center gap-2 min-h-[44px] text-sm text-gray-500">
            <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            <span>{myRole ? t.resigning : t.registering}</span>
          </div>
        ) : myRole ? (
          // User is registered → show current role + Peru button
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-500">{t.yourRole}</div>
              <div className="text-sm font-medium text-gray-800">{ROLE_LABELS[myRole] || myRole}</div>
            </div>
            <button
              onClick={handleResign}
              className="flex items-center justify-center min-h-[44px] min-w-[120px] text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 active:bg-red-100 transition-colors"
            >
              {t.cancelRegistration}
            </button>
          </div>
        ) : isAdmin && !event.isFull ? (
          // User can register → single green CTA
          <button
            onClick={() => setShowRolePicker(true)}
            className="w-full flex items-center justify-center min-h-[44px] text-sm bg-green-600 text-white font-medium rounded-xl active:bg-green-700 transition-colors"
          >
            {t.registerAsStaff}
          </button>
        ) : isAdmin && event.isFull ? (
          <div className="text-center text-sm text-gray-400 py-1">{t.registrationFull}</div>
        ) : (
          <div className="text-center text-xs text-gray-400 italic py-1">{t.adminOnly}</div>
        )}
      </div>

      {/* ── Bottom sheet: role picker ── */}
      {showRolePicker && (
        <RolePickerSheet
          event={event}
          onSelect={handleRegister}
          onClose={() => setShowRolePicker(false)}
        />
      )}
    </div>
  )
}

// ── Role display row (read-only, no buttons) ──
function RoleRow({ label, person, isMe }) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between min-h-[44px]">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-32 shrink-0">{label}</span>
      {person ? (
        <span className="text-sm text-gray-800 truncate text-right">
          {person.userName}
          {isMe && <span className="text-blue-500 text-xs ml-1">{t.you}</span>}
        </span>
      ) : (
        <span className="text-sm text-gray-300">—</span>
      )}
    </div>
  )
}

// ── Bottom sheet role picker (ManagePage-style) ──
function RolePickerSheet({ event, onSelect, onClose }) {
  const [selected, setSelected] = useState(null)

  const roles = [
    {
      key: 'leadInstructor',
      label: t.leadInstructor,
      taken: !!event.leadInstructor,
      takenBy: event.leadInstructor?.userName,
    },
    {
      key: 'equipmentManager',
      label: t.equipmentManager,
      taken: !!event.equipmentManager,
      takenBy: event.equipmentManager?.userName,
    },
    {
      key: 'staff',
      label: t.instructor,
      taken: false,
      count: event.staff?.length || 0,
      max: Math.max(0, event.maxTrainers - (event.leadInstructor ? 1 : 0) - (event.equipmentManager ? 1 : 0)),
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md bg-white rounded-t-2xl shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="px-4 pt-4 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
          <h3 className="font-semibold text-gray-800">{t.selectRole}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{event.eventName}</p>
        </div>

        {/* Role options */}
        <div className="px-4 pb-3 space-y-2">
          {roles.map(role => {
            const disabled = role.taken
            const isStaff = role.key === 'staff'
            const isFull = isStaff && role.count >= role.max

            return (
              <button
                key={role.key}
                onClick={() => !disabled && !isFull && setSelected(role.key)}
                disabled={disabled || isFull}
                className={`w-full flex items-center p-3.5 rounded-xl border transition-colors ${
                  selected === role.key
                    ? 'border-green-500 bg-green-50'
                    : disabled || isFull
                    ? 'border-gray-100 bg-gray-50 opacity-60'
                    : 'border-gray-200 active:bg-gray-50'
                }`}
              >
                {/* Radio indicator */}
                <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center mr-3 ${
                  selected === role.key ? 'border-green-500' : 'border-gray-300'
                }`}>
                  {selected === role.key && <div className="w-2.5 h-2.5 rounded-full bg-green-500" />}
                </div>

                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-gray-800">{role.label}</div>
                  {disabled && (
                    <div className="text-xs text-gray-400">{role.takenBy} — {t.taken}</div>
                  )}
                  {isStaff && !isFull && (
                    <div className="text-xs text-gray-400">{role.count}/{role.max} {t.staffSlots}</div>
                  )}
                  {isStaff && isFull && (
                    <div className="text-xs text-red-400">{t.registrationFull}</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Confirm + Cancel */}
        <div className="px-4 pb-6 space-y-2">
          <button
            onClick={() => selected && onSelect(selected)}
            disabled={!selected}
            className="w-full min-h-[48px] text-sm font-medium rounded-xl transition-colors bg-green-600 text-white active:bg-green-700 disabled:opacity-40 disabled:active:bg-green-600"
          >
            {t.confirm}
          </button>
          <button
            onClick={onClose}
            className="w-full min-h-[44px] text-sm text-gray-500 font-medium rounded-xl bg-gray-100 active:bg-gray-200 transition-colors"
          >
            {t.cancel}
          </button>
        </div>
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

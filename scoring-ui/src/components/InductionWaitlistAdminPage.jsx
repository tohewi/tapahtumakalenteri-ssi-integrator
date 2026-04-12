import { useEffect, useMemo, useState } from 'react'
import * as api from '../api'
import LoginScreen from './LoginScreen'
import t from '../i18n'
import {
  adminCancelWaitlistEntry,
  completeWaitlistGroup,
  createWaitlistInductionGroup,
  fetchWaitlistAdminData,
} from '../waitlist-api'

export default function InductionWaitlistAdminPage() {
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null)
  const [entries, setEntries] = useState([])
  const [groups, setGroups] = useState([])
  const [thresholdReached, setThresholdReached] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [groupLabel, setGroupLabel] = useState('')
  const [plannedDate, setPlannedDate] = useState('')

  useEffect(() => {
    api.getAuthStatus().then(status => {
      if (status.authenticated && status.scope === 'waitlist') {
        setAuthed(true)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (authed) {
      loadData()
    }
  }, [authed]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchWaitlistAdminData()
      setEntries(data.entries || [])
      setGroups(data.groups || [])
      setThresholdReached(data.thresholdReached === true)
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        setSessionExpiredMessage(t.waitlistAdminSessionExpired)
        setAuthed(false)
        return
      }
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(email, password, apiKey, rememberMe) {
    setSessionExpiredMessage(null)
    await api.login(email, password, apiKey, 'waitlist')
    setAuthed(true)
    return rememberMe
  }

  async function handleLogout() {
    try {
      await api.logout()
    } catch {
      // ignore logout errors on client reset
    }
    setAuthed(false)
    setEntries([])
    setGroups([])
    setSelectedIds([])
    setError(null)
  }

  async function handleCreateGroup(event) {
    event.preventDefault()
    if (selectedIds.length === 0 || !groupLabel.trim()) return

    setLoading(true)
    setError(null)
    try {
      await createWaitlistInductionGroup({
        participantIds: selectedIds,
        label: groupLabel.trim(),
        plannedDate: plannedDate || null,
      })
      setSelectedIds([])
      setGroupLabel('')
      setPlannedDate('')
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCompleteGroup(groupId) {
    setLoading(true)
    setError(null)
    try {
      await completeWaitlistGroup(groupId)
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancelEntry(entryId) {
    setLoading(true)
    setError(null)
    try {
      await adminCancelWaitlistEntry(entryId)
      setSelectedIds(current => current.filter(id => id !== entryId))
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const waitingEntries = useMemo(
    () => entries.filter(entry => entry.status === 'waiting'),
    [entries],
  )

  const selectedEntries = useMemo(
    () => entries.filter(entry => entry.status === 'selected'),
    [entries],
  )

  const completedEntries = useMemo(
    () => entries.filter(entry => entry.status === 'completed'),
    [entries],
  )

  const withdrawnEntries = useMemo(
    () => entries.filter(entry => entry.status === 'withdrawn'),
    [entries],
  )

  const equipmentSummary = useMemo(() => {
    const needClub22 = waitingEntries.filter(entry => entry.equipmentChoice === 'need-club-22').length
    return {
      needClub22,
      ownPistol: waitingEntries.length - needClub22,
    }
  }, [waitingEntries])

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-slate-700 to-emerald-950 text-white px-4 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-xl font-bold">{t.waitlistAdminTitle}</h1>
              <p className="text-slate-300 text-sm mt-1">{t.waitlistAdminSubtitle}</p>
            </div>
            <a href="#/" className="text-slate-300 text-sm active:text-white">
              {t.home}
            </a>
          </div>
        </div>
        {sessionExpiredMessage && (
          <div className="mx-4 mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
            {sessionExpiredMessage}
          </div>
        )}
        <LoginScreen
          onLogin={handleLogin}
          title={t.waitlistAdminTitle}
          subtitle={t.waitlistAdminLoginSubtitle}
          hideHeader
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-slate-700 to-emerald-950 text-white px-4 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-bold">{t.waitlistAdminTitle}</h1>
            <p className="text-slate-300 text-sm mt-1">{t.waitlistAdminSubtitle}</p>
          </div>
          <button onClick={handleLogout} className="text-slate-300 text-sm active:text-white">
            {t.logout}
          </button>
        </div>
      </div>

      <div className="p-4 max-w-6xl mx-auto space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <SummaryCard label={t.waitlistAdminWaitingCount} value={waitingEntries.length} tone="emerald" />
          <SummaryCard label={t.waitlistAdminSelectedCount} value={selectedEntries.length} tone="amber" />
          <SummaryCard label={t.waitlistAdminCompletedCount} value={completedEntries.length} tone="blue" />
          <SummaryCard label={t.waitlistAdminWithdrawnCount} value={withdrawnEntries.length} tone="slate" />
        </div>

        {thresholdReached && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-sm text-amber-900 font-medium">
            ⚠️ {t.waitlistAdminThresholdReached}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t.waitlistAdminWaitingTitle}</h2>
                <p className="text-sm text-gray-600 mt-1">{t.waitlistAdminWaitingBody}</p>
              </div>
              {loading && <span className="text-sm text-gray-400">{t.loading}</span>}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-900">
                {t.waitlistNeedClub22}: {equipmentSummary.needClub22}
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900">
                {t.waitlistOwnPistol}: {equipmentSummary.ownPistol}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {waitingEntries.length === 0 && (
                <p className="text-sm text-gray-500">{t.waitlistAdminNoWaiting}</p>
              )}

              {waitingEntries.map(entry => {
                const checked = selectedIds.includes(entry.id)
                return (
                  <label key={entry.id} className="block border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelectedIds(current => {
                            if (event.target.checked) return [...current, entry.id]
                            return current.filter(id => id !== entry.id)
                          })
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900">{entry.firstName} {entry.lastName}</div>
                        <div className="text-sm text-gray-600 mt-1">{entry.email}</div>
                        <div className="text-sm text-gray-600">{entry.association}</div>
                        <div className="text-xs text-gray-500 mt-2">
                          {entry.equipmentChoice === 'need-club-22' ? t.waitlistNeedClub22 : t.waitlistOwnPistol}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancelEntry(entry.id)}
                        className="text-xs text-red-600 underline"
                      >
                        {t.cancel}
                      </button>
                    </div>
                  </label>
                )
              })}
            </div>
          </section>

          <section className="space-y-4">
            <form onSubmit={handleCreateGroup} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">{t.waitlistAdminCreateGroupTitle}</h2>
              <p className="text-sm text-gray-600 mt-1">{t.waitlistAdminCreateGroupBody}</p>
              <label className="block mt-4">
                <span className="block text-sm font-medium text-gray-700 mb-1">{t.waitlistAdminGroupLabel}</span>
                <input
                  type="text"
                  value={groupLabel}
                  onChange={(event) => setGroupLabel(event.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="block mt-3">
                <span className="block text-sm font-medium text-gray-700 mb-1">{t.waitlistAdminPlannedDate}</span>
                <input
                  type="date"
                  value={plannedDate}
                  onChange={(event) => setPlannedDate(event.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <div className="mt-3 text-sm text-gray-600">
                {t.waitlistAdminSelectedLabel}: {selectedIds.length}
              </div>
              <button
                type="submit"
                disabled={loading || selectedIds.length === 0 || !groupLabel.trim()}
                className="w-full mt-4 py-3 bg-emerald-600 text-white rounded-xl font-semibold disabled:bg-gray-300 disabled:text-gray-500"
              >
                {t.waitlistAdminCreateGroupButton}
              </button>
            </form>

            <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">{t.waitlistAdminGroupsTitle}</h2>
              <div className="mt-4 space-y-3">
                {groups.length === 0 && <p className="text-sm text-gray-500">{t.waitlistAdminNoGroups}</p>}
                {groups.map(group => (
                  <div key={group.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-gray-900">{group.label}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          {group.plannedDate || t.waitlistAdminNoDate}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {t.waitlistAdminParticipantCount}: {group.participantIds.length}
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-200 text-slate-800">
                        {group.status}
                      </span>
                    </div>
                    {group.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={() => handleCompleteGroup(group.id)}
                        className="w-full mt-3 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium"
                      >
                        {t.waitlistAdminCompleteGroupButton}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </section>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, tone }) {
  const tones = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    slate: 'bg-slate-50 border-slate-200 text-slate-900',
  }

  return (
    <div className={`border rounded-2xl p-4 shadow-sm ${tones[tone] || tones.slate}`}>
      <div className="text-sm font-medium">{label}</div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </div>
  )
}
import { useState, useEffect, useCallback } from 'react'
import { useAuthenticatedPage } from '../hooks/useAuthenticatedPage'
import LoginScreen from './LoginScreen'
import ManageSessionGate from './manage/ManageSessionGate'
import { AppHeader, ErrorBanner, Spinner } from './shared'
import * as gunsApi from '../guns-api'

export default function GunsPage() {
  return (
    <ManageSessionGate>
      {authenticated => <GunsPageContent initialAuthenticated={authenticated} />}
    </ManageSessionGate>
  )
}

function GunsPageContent({ initialAuthenticated }) {
  const [guns, setGuns] = useState([])
  const [config, setConfig] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingGun, setEditingGun] = useState(null)
  const [maintGun, setMaintGun] = useState(null)
  const [maintNotes, setMaintNotes] = useState('')
  const [formState, setFormState] = useState({
    make: '',
    model: '',
    serialNumber: '',
    acquisitionYear: new Date().getFullYear(),
  })

  const clearPageState = useCallback(() => {
    setGuns([])
    setConfig(null)
  }, [])

  const {
    authed,
    loading,
    setLoading,
    error,
    setError,
    sessionExpiredMessage,
    savedCreds,
    withSessionCheck,
    handleLogin: baseLogin,
    handleLogout,
  } = useAuthenticatedPage({
    scope: 'manage',
    credsKey: 'ssi_credentials_manage',
    onClearState: clearPageState,
    initialAuthenticated,
  })

  const loadInventory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await withSessionCheck(async () => {
        const res = await gunsApi.getGuns()
        setGuns(res.guns || [])
        setConfig(res.config || null)
      })
    } catch (err) {
      if (!err.sessionExpired && !err.scopeMismatch) {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }, [setLoading, setError, withSessionCheck])

  useEffect(() => {
    if (!authed) return
    let active = true
    setLoading(true)
    setError(null)
    withSessionCheck(async () => {
      const res = await gunsApi.getGuns()
      if (!active) return
      setGuns(res.guns || [])
      setConfig(res.config || null)
    })
      .catch(err => {
        if (!active) return
        if (!err.sessionExpired && !err.scopeMismatch) {
          setError(err.message)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [authed, setLoading, setError, withSessionCheck])

  const handleLogin = async (email, password, apiKey, rememberMe) => {
    await baseLogin(email, password, apiKey, rememberMe)
  }

  const openAddModal = () => {
    setEditingGun(null)
    setFormState({
      make: '',
      model: '',
      serialNumber: '',
      acquisitionYear: new Date().getFullYear(),
    })
    setShowAddModal(true)
  }

  const openEditModal = (gun) => {
    setEditingGun(gun)
    setFormState({
      make: gun.make,
      model: gun.model,
      serialNumber: gun.serialNumber,
      acquisitionYear: gun.acquisitionYear,
    })
    setShowAddModal(true)
  }

  const handleSaveGun = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      if (editingGun) {
        await gunsApi.updateGun(editingGun.id, formState)
      } else {
        await gunsApi.createGun(formState)
      }
      setShowAddModal(false)
      setEditingGun(null)
      await loadInventory()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRetireGun = async (gun) => {
    setError(null)
    try {
      await gunsApi.retireGun(gun.id)
      await loadInventory()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleReturnGun = async (gun) => {
    setError(null)
    try {
      await gunsApi.returnGun(gun.id)
      await loadInventory()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleReturnAll = async () => {
    setError(null)
    try {
      await gunsApi.returnAllGuns()
      await loadInventory()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRecordMaintenance = async (e) => {
    e.preventDefault()
    if (!maintGun) return
    setError(null)
    try {
      await gunsApi.recordGunMaintenance(maintGun.id, { notes: maintNotes })
      setMaintGun(null)
      setMaintNotes('')
      await loadInventory()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!authed) {
    return (
      <div>
        {sessionExpiredMessage && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 text-center">
            <p className="text-yellow-800 text-sm font-medium">{sessionExpiredMessage}</p>
          </div>
        )}
        <LoginScreen
          onLogin={handleLogin}
          initialEmail={savedCreds?.email}
          initialPassword={savedCreds?.password}
          initialApiKey={savedCreds?.apiKey}
          title="Laina-aseet ja huolto"
          subtitle="Kirjaudu SSI-tunnuksilla (Ryhmä 25874 admin)"
        />
      </div>
    )
  }

  const inRangeCount = guns.filter(g => g.state === 'in_range_use').length

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <AppHeader
        title="Laina-aseet ja huolto"
        subtitle={config?.accessControl?.groupId ? `SSI Ryhmä ${config.accessControl.groupId} (admin)` : 'TurRes asekaappi'}
        backLabel="Alkuun"
        onBack={() => { window.location.hash = '#/' }}
        onLogout={handleLogout}
      />

      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      {loading && <Spinner />}

      <div className="p-3 max-w-2xl mx-auto space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={openAddModal}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm active:bg-blue-700"
          >
            + Lisää ase
          </button>
          {inRangeCount > 0 && (
            <button
              type="button"
              onClick={handleReturnAll}
              className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm active:bg-emerald-700"
            >
              Palauta kaikki kaappiin ({inRangeCount})
            </button>
          )}
        </div>

        {guns.length === 0 && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500 text-sm">
            Ei aseita inventaariossa. Lisää ensimmäinen ase painamalla &quot;+ Lisää ase&quot;.
          </div>
        )}

        <div className="space-y-2.5">
          {guns.map(gun => {
            const isInUse = gun.state === 'in_range_use'
            return (
              <div key={gun.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900 text-base">
                        {gun.make} {gun.model}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        isInUse ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {isInUse ? 'Radalla käytössä' : 'Asekaapissa'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Sarjanumero: <span className="font-mono font-medium text-gray-700">{gun.serialNumber}</span> · Hankintavuosi: {gun.acquisitionYear}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isInUse && (
                      <button
                        type="button"
                        onClick={() => handleReturnGun(gun)}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold active:bg-emerald-700"
                      >
                        Palauta kaappiin
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setMaintGun(gun); setMaintNotes('') }}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold active:bg-indigo-100"
                    >
                      Huolto / Puhdistus
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(gun)}
                      className="px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium active:bg-gray-200"
                    >
                      Muokkaa
                    </button>
                    {!isInUse && (
                      <button
                        type="button"
                        onClick={() => handleRetireGun(gun)}
                        className="px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium active:bg-red-100"
                      >
                        Poista
                      </button>
                    )}
                  </div>
                </div>

                {isInUse && gun.currentCheckout && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900">
                    Käyttäjä: <strong>{gun.currentCheckout.shooterName}</strong>
                    {gun.currentCheckout.cupName ? ` · ${gun.currentCheckout.cupName}` : ''}
                    {` · Patruunat: ${gun.currentCheckout.cartridgesGiven} kpl`}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2 bg-gray-50 rounded-lg p-2.5 text-xs">
                  <div>
                    <span className="text-gray-500 block">Käyttökerrat / patruunat yhteensä</span>
                    <span className="font-semibold text-gray-800">
                      {gun.timesUsedTotal} kertaa · {gun.cartridgesIssuedTotal} patr.
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Edellisen puhdistuksen jälkeen</span>
                    <span className="font-semibold text-indigo-700">
                      {gun.timesUsedSinceMaintenance} kertaa · {gun.cartridgesSinceMaintenance} patr.
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleSaveGun} className="bg-white rounded-2xl shadow-xl p-5 max-w-sm w-full space-y-3">
            <h3 className="font-bold text-gray-900 text-base">
              {editingGun ? 'Muokkaa asetta' : 'Lisää uusi ase'}
            </h3>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Merkki (Make)</label>
              <input
                type="text"
                required
                placeholder="esim. CZ"
                value={formState.make}
                onChange={e => setFormState(s => ({ ...s, make: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Malli (Model)</label>
              <input
                type="text"
                required
                placeholder="esim. Shadow 2"
                value={formState.model}
                onChange={e => setFormState(s => ({ ...s, model: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sarjanumero (Serial Number)</label>
              <input
                type="text"
                required
                placeholder="esim. D482910"
                value={formState.serialNumber}
                onChange={e => setFormState(s => ({ ...s, serialNumber: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hankintavuosi (Acquisition Year)</label>
              <input
                type="number"
                required
                min="1900"
                max="2100"
                value={formState.acquisitionYear}
                onChange={e => setFormState(s => ({ ...s, acquisitionYear: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium"
              >
                Peruuta
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold"
              >
                Tallenna
              </button>
            </div>
          </form>
        </div>
      )}

      {maintGun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleRecordMaintenance} className="bg-white rounded-2xl shadow-xl p-5 max-w-sm w-full space-y-3">
            <h3 className="font-bold text-gray-900 text-base">
              Kirjaa puhdistus / huolto: {maintGun.make} {maintGun.model}
            </h3>
            <p className="text-xs text-gray-500">
              Nollaa käyttökerrat ({maintGun.timesUsedSinceMaintenance}) ja patruunat ({maintGun.cartridgesSinceMaintenance}) edellisen puhdistuksen jälkeen.
            </p>
            <input
              type="text"
              placeholder="Huomiot (esim. Puhdistus ja voitelu)"
              value={maintNotes}
              onChange={e => setMaintNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
            />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMaintGun(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium"
              >
                Peruuta
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold"
              >
                Kuittaa huolletuksi
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

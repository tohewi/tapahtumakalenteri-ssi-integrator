import { useState } from 'react'

export default function LoanerGunPickerSheet({ shooter, guns = [], onConfirm, onClose }) {
  const availableGuns = (guns || []).filter(g => g.state === 'in_gun_safe')
  const [selectedGunId, setSelectedGunId] = useState(availableGuns[0]?.id || '')
  const [cartridgesGiven, setCartridgesGiven] = useState(100)

  const selectedGun = availableGuns.find(g => g.id === selectedGunId) || null
  const recommendedAmmo = selectedGun?.defaultAmmoLabel || selectedGun?.ammoMake || ''

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!selectedGunId) return
    onConfirm({
      gunId: selectedGunId,
      cartridgesGiven: Number(cartridgesGiven),
      ammoId: selectedGun?.defaultAmmoId || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg bg-white rounded-t-2xl p-4 pb-6 shadow-xl animate-slide-up space-y-4"
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto" />
        <div>
          <h3 className="font-bold text-gray-800 text-base">Valitse laina-ase ja patruunat</h3>
          <p className="text-gray-600 text-sm font-medium mt-0.5">{shooter.name}</p>
          {shooter.email && <p className="text-gray-400 text-xs">{shooter.email}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Vapaa laina-ase (Asekaapissa)
          </label>
          {availableGuns.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
              Ei vapaita aseita asekaapissa. Lisää aseita tai palauta käytössä olevat aseet.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {availableGuns.map(gun => {
                const selected = selectedGunId === gun.id
                const gunAmmo = gun.defaultAmmoLabel || gun.ammoMake
                return (
                  <button
                    key={gun.id}
                    type="button"
                    onClick={() => setSelectedGunId(gun.id)}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-colors ${
                      selected
                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                        : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm">{gun.make} {gun.model}</div>
                      <div className="text-xs text-gray-500 font-mono">
                        SN: {gun.serialNumber} · {gun.acquisitionYear}
                      </div>
                      {gunAmmo && (
                        <div className="text-xs font-semibold text-indigo-700 mt-0.5">
                          Patruuna: {gunAmmo}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 text-right">
                      <div>Huollon jälkeen:</div>
                      <div className="font-semibold text-gray-700">
                        {gun.timesUsedSinceMaintenance} krt / {gun.cartridgesSinceMaintenance} patr.
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {recommendedAmmo && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 text-xs text-indigo-900 font-medium">
            Suositeltu luovutettava patruuna tälle aseelle: <strong>{recommendedAmmo}</strong>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Annetut patruunat (patruunamäärä)
          </label>
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => setCartridgesGiven(100)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
                Number(cartridgesGiven) === 100
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-gray-100 text-gray-700 border-gray-200'
              }`}
            >
              100 patr. (Kupittaa vakio)
            </button>
            <button
              type="button"
              onClick={() => setCartridgesGiven(0)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
                Number(cartridgesGiven) === 0
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-gray-100 text-gray-700 border-gray-200'
              }`}
            >
              0 patr. (oma hankintalupa)
            </button>
          </div>
          <input
            type="number"
            min="0"
            max="5000"
            aria-label="Patruunamäärä"
            value={cartridgesGiven}
            onChange={e => setCartridgesGiven(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 text-center text-gray-600 font-medium text-sm rounded-xl bg-gray-100 active:bg-gray-200"
          >
            Peruuta
          </button>
          <button
            type="submit"
            disabled={!selectedGunId || availableGuns.length === 0}
            className="flex-1 py-2.5 text-center text-white font-semibold text-sm rounded-xl bg-blue-600 active:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500"
          >
            Merkitse käyttöön
          </button>
        </div>
      </form>
    </div>
  )
}

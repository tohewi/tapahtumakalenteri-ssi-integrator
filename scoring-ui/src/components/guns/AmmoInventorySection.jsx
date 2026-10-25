import { useState } from 'react'
import * as gunsApi from '../../guns-api'
import { formatDateShort } from '../shared'
import t from '../../i18n'

export default function AmmoInventorySection({ ammo = [], onRefresh, onError }) {
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [showStocktakeTable, setShowStocktakeTable] = useState(false)
  const [countsById, setCountsById] = useState({})
  const [stocktakeNotes, setStocktakeNotes] = useState('')
  const [purchaseForm, setPurchaseForm] = useState({
    make: '',
    model: '',
    caliber: '.22 LR',
    count: 1000,
    price: 0,
    store: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchasedBy: '',
  })

  const latestStocktakeAt = ammo.reduce((latest, item) => {
    if (!item.lastStocktakeAt) return latest
    if (!latest || item.lastStocktakeAt > latest) return item.lastStocktakeAt
    return latest
  }, null)

  const handleSavePurchase = async (e) => {
    e.preventDefault()
    try {
      await gunsApi.addAmmoPurchase(purchaseForm)
      setShowPurchaseModal(false)
      await onRefresh()
    } catch (err) {
      onError?.(err.message)
    }
  }

  const openWholeStocktake = () => {
    const initial = {}
    for (const item of ammo) {
      initial[item.id] = item.calculatedStock ?? 0
    }
    setCountsById(initial)
    setStocktakeNotes('')
    setShowStocktakeTable(true)
  }

  const handleSaveWholeStocktake = async (e) => {
    e.preventDefault()
    try {
      const items = ammo.map(item => ({
        ammoId: item.id,
        actualCount: Number(countsById[item.id] ?? item.calculatedStock ?? 0),
      }))
      await gunsApi.recordWholeAmmoStocktake({
        items,
        notes: stocktakeNotes,
      })
      setShowStocktakeTable(false)
      await onRefresh()
    } catch (err) {
      onError?.(err.message)
    }
  }

  return (
    <div className="space-y-3">
      {/* CSV Export Toolbar for Ammo (R90-GUN16) */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          CSV-lataukset ({t.ammoInventoryTitle})
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={gunsApi.CSV_EXPORT_URLS.ammo}
            download="ammo.csv"
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-medium"
          >
            Lataa patruunat CSV
          </a>
          <a
            href={gunsApi.CSV_EXPORT_URLS.ammoEvents}
            download="ammo-events.csv"
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-medium"
          >
            Lataa patruunatapahtumat CSV
          </a>
        </div>
      </div>

      {/* Ammo Inventory Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-gray-900 text-base">{t.ammoInventoryTitle}</h2>
          <p className="text-xs text-gray-500">
            {latestStocktakeAt
              ? `Viimeisin inventointi: ${formatDateShort(latestStocktakeAt)}`
              : 'Inventointia ei ole vielä tehty'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ammo.length > 0 && (
            <button
              type="button"
              onClick={openWholeStocktake}
              className="px-3.5 py-2 bg-amber-600 text-white rounded-xl font-semibold text-xs active:bg-amber-700"
            >
              {t.stocktakeButton}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowPurchaseModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold text-xs active:bg-indigo-700"
          >
            {t.addAmmoPurchaseButton}
          </button>
        </div>
      </div>

      {/* Whole-Inventory Summary Table (R90-GUN14) */}
      {ammo.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center text-gray-500 text-xs">
          Ei patruunoita varastossa. Kirjaa ensimmäinen patruunaosto painamalla &quot;{t.addAmmoPurchaseButton}&quot;.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold">
                <th className="p-3">{t.makeLabel} / {t.modelLabel}</th>
                <th className="p-3">{t.caliberLabel}</th>
                <th className="p-3 text-right">Varastosaldo</th>
                <th className="p-3 text-right">Inventoitu</th>
                <th className="p-3 text-right">Inventointipäivä</th>
                <th className="p-3 text-right">{t.lastDiscrepancyLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ammo.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="p-3">
                    <div className="font-bold text-gray-900 text-sm">{item.make} {item.model}</div>
                    <div className="text-[11px] text-gray-500">
                      Ostettu yht: {item.totalPurchased} patr. ({item.totalSpendEur} €) · Kulutettu yht: {item.totalIssued} patr.
                    </div>
                  </td>
                  <td className="p-3 font-mono text-indigo-700 font-semibold">{item.caliber}</td>
                  <td className="p-3 text-right">
                    <span className="font-bold text-gray-900 text-sm">{item.calculatedStock} patr.</span>
                    {item.lastStocktakeCount !== null && item.lastStocktakeCount !== undefined && (
                      <div className="text-[11px] text-gray-500">
                        Inv. {item.lastStocktakeCount} + osto {item.purchasedSinceStocktake || 0} − kulutus {item.issuedSinceStocktake || 0}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right text-gray-700 font-medium">
                    {item.lastStocktakeCount !== null && item.lastStocktakeCount !== undefined
                      ? `${item.lastStocktakeCount} patr.`
                      : '—'}
                  </td>
                  <td className="p-3 text-right text-gray-600">
                    {item.lastStocktakeAt ? formatDateShort(item.lastStocktakeAt) : t.notStocktakenYet}
                  </td>
                  <td className="p-3 text-right">
                    <span className={`font-semibold ${
                      item.lastDiscrepancy === null ? 'text-gray-400'
                        : item.lastDiscrepancy === 0 ? 'text-green-700'
                        : 'text-red-700'
                    }`}>
                      {item.lastDiscrepancy === null
                        ? '—'
                        : `${item.lastDiscrepancy > 0 ? '+' : ''}${item.lastDiscrepancy} patr.`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Whole-Inventory Stocktake Modal (all cartridge types at once) */}
      {showStocktakeTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleSaveWholeStocktake} className="bg-white rounded-2xl shadow-xl p-5 max-w-xl w-full space-y-3 text-xs">
            <h3 className="font-bold text-gray-900 text-base">
              {t.stocktakeButton} — Kaikki patruunatyypit
            </h3>
            <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold">
                    <th className="p-2.5">{t.makeLabel} / {t.modelLabel} ({t.caliberLabel})</th>
                    <th className="p-2.5 text-right">{t.calculatedStockLabel}</th>
                    <th className="p-2.5 text-right">{t.actualCountLabel}</th>
                    <th className="p-2.5 text-right">Ero</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ammo.map(item => {
                    const actualVal = Number(countsById[item.id] ?? item.calculatedStock ?? 0)
                    const diff = actualVal - (item.calculatedStock ?? 0)
                    return (
                      <tr key={item.id}>
                        <td className="p-2.5 font-semibold text-gray-900">
                          {item.make} {item.model} <span className="font-mono text-indigo-700">({item.caliber})</span>
                        </td>
                        <td className="p-2.5 text-right font-medium text-gray-700">
                          {item.calculatedStock} patr.
                        </td>
                        <td className="p-2.5 text-right">
                          <input
                            type="number"
                            required
                            min="0"
                            aria-label={`Todellinen määrä ${item.make} ${item.model}`}
                            value={countsById[item.id] ?? item.calculatedStock ?? 0}
                            onChange={e => setCountsById(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                            className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-right text-sm font-semibold"
                          />
                        </td>
                        <td className={`p-2.5 text-right font-bold ${diff === 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {diff > 0 ? '+' : ''}{diff}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <input
              type="text"
              placeholder={t.notesOptionalPlaceholder}
              value={stocktakeNotes}
              onChange={e => setStocktakeNotes(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
            />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowStocktakeTable(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold"
              >
                {t.confirmStocktakeButton}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Ammo Purchase Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleSavePurchase} className="bg-white rounded-2xl shadow-xl p-5 max-w-sm w-full space-y-2.5 text-xs">
            <h3 className="font-bold text-gray-900 text-base">{t.addAmmoPurchaseTitle}</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-medium text-gray-700 mb-0.5">{t.makeLabel}</label>
                <input
                  type="text"
                  required
                  placeholder={t.ammoMakePlaceholder}
                  value={purchaseForm.make}
                  onChange={e => setPurchaseForm(s => ({ ...s, make: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-0.5">{t.modelLabel}</label>
                <input
                  type="text"
                  required
                  placeholder={t.ammoModelPlaceholder}
                  value={purchaseForm.model}
                  onChange={e => setPurchaseForm(s => ({ ...s, model: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block font-medium text-gray-700 mb-0.5">{t.caliberLabel}</label>
                <input
                  type="text"
                  required
                  placeholder=".22 LR"
                  value={purchaseForm.caliber}
                  onChange={e => setPurchaseForm(s => ({ ...s, caliber: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-0.5">{t.countLabel}</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={purchaseForm.count}
                  onChange={e => setPurchaseForm(s => ({ ...s, count: Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-0.5">{t.priceLabel}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchaseForm.price}
                  onChange={e => setPurchaseForm(s => ({ ...s, price: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-medium text-gray-700 mb-0.5">{t.storeLabel}</label>
                <input
                  type="text"
                  placeholder={t.storePlaceholder}
                  value={purchaseForm.store}
                  onChange={e => setPurchaseForm(s => ({ ...s, store: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-0.5">{t.dateLabel}</label>
                <input
                  type="date"
                  value={purchaseForm.purchaseDate}
                  onChange={e => setPurchaseForm(s => ({ ...s, purchaseDate: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium text-gray-700 mb-0.5">{t.buyerLabel}</label>
              <input
                type="text"
                placeholder={t.buyerPlaceholder}
                value={purchaseForm.purchasedBy}
                onChange={e => setPurchaseForm(s => ({ ...s, purchasedBy: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPurchaseModal(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold"
              >
                {t.savePurchaseButton}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

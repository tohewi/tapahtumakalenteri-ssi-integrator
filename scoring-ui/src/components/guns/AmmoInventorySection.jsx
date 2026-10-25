import { useState } from 'react'
import * as gunsApi from '../../guns-api'
import t from '../../i18n'

export default function AmmoInventorySection({ ammo = [], onRefresh, onError }) {
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [stocktakeItem, setStocktakeItem] = useState(null)
  const [actualCount, setActualCount] = useState(0)
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

  const openStocktake = (item) => {
    setStocktakeItem(item)
    setActualCount(item.calculatedStock ?? 0)
    setStocktakeNotes('')
  }

  const handleSaveStocktake = async (e) => {
    e.preventDefault()
    if (!stocktakeItem) return
    try {
      await gunsApi.recordAmmoStocktake(stocktakeItem.id, {
        actualCount: Number(actualCount),
        notes: stocktakeNotes,
      })
      setStocktakeItem(null)
      await onRefresh()
    } catch (err) {
      onError?.(err.message)
    }
  }

  const liveDiscrepancy = stocktakeItem
    ? Number(actualCount) - (stocktakeItem.calculatedStock ?? 0)
    : 0

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900 text-base">{t.ammoInventoryTitle}</h2>
          <p className="text-xs text-gray-500">{t.ammoInventoryDescription}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowPurchaseModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold text-xs active:bg-indigo-700"
        >
          {t.addAmmoPurchaseButton}
        </button>
      </div>

      {ammo.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center text-gray-500 text-xs">
          Ei patruunoita varastossa. Kirjaa ensimmäinen patruunaosto painamalla &quot;{t.addAmmoPurchaseButton}&quot;.
        </div>
      ) : (
        <div className="space-y-2">
          {ammo.map(item => (
            <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">
                    {item.make} {item.model} <span className="text-indigo-700 font-mono">({item.caliber})</span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Ostettu yht: {item.totalPurchased} patr. ({item.totalSpendEur} €) · Luovutettu yht: {item.totalIssued} patr.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openStocktake(item)}
                  className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold active:bg-amber-100"
                >
                  {t.stocktakeButton}
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 bg-gray-50 rounded-lg p-2 text-xs">
                <div>
                  <span className="text-gray-500 block">{t.calculatedStockLabel}</span>
                  <span className="font-bold text-gray-900 text-sm">{item.calculatedStock} patr.</span>
                </div>
                <div>
                  <span className="text-gray-500 block">{t.lastDiscrepancyLabel}</span>
                  <span className={`font-semibold ${
                    item.lastDiscrepancy === null ? 'text-gray-500'
                      : item.lastDiscrepancy === 0 ? 'text-green-700'
                      : 'text-red-700'
                  }`}>
                    {item.lastDiscrepancy === null
                      ? t.notStocktakenYet
                      : `${item.lastDiscrepancy > 0 ? '+' : ''}${item.lastDiscrepancy} patr.`}
                  </span>
                </div>
              </div>
            </div>
          ))}
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

      {/* Physical Stocktake Discrepancy Modal */}
      {stocktakeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleSaveStocktake} className="bg-white rounded-2xl shadow-xl p-5 max-w-sm w-full space-y-3 text-xs">
            <h3 className="font-bold text-gray-900 text-base">
              {t.stocktakeButton}: {stocktakeItem.make} {stocktakeItem.model} ({stocktakeItem.caliber})
            </h3>
            <div className="bg-gray-50 rounded-xl p-3 space-y-1">
              <div>{t.calculatedStockLabel}: <strong>{stocktakeItem.calculatedStock} patr.</strong></div>
              <div>
                {t.lastDiscrepancyLabel}:{' '}
                <strong className={liveDiscrepancy === 0 ? 'text-green-700' : 'text-red-700'}>
                  {liveDiscrepancy > 0 ? '+' : ''}{liveDiscrepancy} patr.
                </strong>
              </div>
            </div>
            <div>
              <label className="block font-medium text-gray-700 mb-1">{t.actualCountLabel}</label>
              <input
                type="number"
                required
                min="0"
                value={actualCount}
                onChange={e => setActualCount(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
              />
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
                onClick={() => setStocktakeItem(null)}
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
    </div>
  )
}

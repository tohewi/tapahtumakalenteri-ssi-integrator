import { useState } from 'react'
import t from '../i18n'
import { SCORE_ZONES, getTotalHits, getTotalPoints } from '../lib/scoring-helpers'

export function TabletHeaderAndStats({
  cup,
  match,
  squad,
  isMatchCompleted,
  userEmail,
  userName,
  totalShots,
  totalShotsInMatch,
  totalPoints,
  xCount,
  onBack,
  onBackToCup,
  onBackToMatch,
  onLogout,
}) {
  return (
    <>
      <div className="bg-blue-600 text-white px-3 py-2 shadow-md flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={onBackToCup}
              aria-label={`${t.back}: ${cup?.name || t.cups}`}
              className="hover:underline focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-1 focus:ring-offset-blue-600 rounded"
            >
              {cup?.name || t.cups}
            </button>
            <span className="opacity-70">›</span>
            <button
              onClick={onBackToMatch}
              aria-label={`${t.back}: ${match.name}`}
              className="hover:underline focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-1 focus:ring-offset-blue-600 rounded"
            >
              {match.name}
            </button>
            {isMatchCompleted && (
              <span className="ml-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded">
                {t.completed}
              </span>
            )}
            <span className="opacity-70">›</span>
            <button
              onClick={onBack}
              aria-label={`${t.back}: ${squad.name}`}
              className="hover:underline focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-1 focus:ring-offset-blue-600 rounded font-semibold"
            >
              {squad.name}
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {userEmail && (
              <div className="opacity-90">
                Kirjautunut: <span className="font-medium">{userName || userEmail.split('@')[0]}</span>
              </div>
            )}
            <button
              onClick={onLogout}
              className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs font-medium transition-colors"
            >
              {t.logout}
            </button>
          </div>
        </div>

        <div className="mt-1 text-xs opacity-80">
          {match.date}
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-3 py-1.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 text-xs">
          <div>
            <span className="text-gray-500">{t.shotsFired}: </span>
            <span className="font-bold text-blue-600">{totalShots}</span>
            <span className="text-gray-400"> / {totalShotsInMatch}</span>
          </div>
          <div>
            <span className="text-gray-500">{t.total}: </span>
            <span className="font-bold text-green-600">{totalPoints} {t.pts}</span>
          </div>
          <div>
            <span className="text-gray-500">{t.xCount}: </span>
            <span className="font-bold text-purple-600">{xCount}</span>
          </div>
        </div>
      </div>
    </>
  )
}

export function TabletShooterSidebar({
  squad,
  selectedShooter,
  allScores,
  totalShotsInMatch,
  handleShooterSelect,
  handleReorderShooter,
}) {
  const [armedIdx, setArmedIdx] = useState(null)
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)

  const resetDragState = () => {
    setArmedIdx(null)
    setDragIdx(null)
    setOverIdx(null)
  }

  const commitDrop = (fromIdx, toIdx) => {
    if (
      fromIdx !== null &&
      toIdx !== null &&
      fromIdx !== toIdx &&
      typeof handleReorderShooter === 'function'
    ) {
      handleReorderShooter(fromIdx, toIdx)
    }
    resetDragState()
  }

  const handleHandleKeyDown = (e, shooterIdx) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      if (shooterIdx > 0) handleReorderShooter?.(shooterIdx, shooterIdx - 1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      if (shooterIdx < squad.shooters.length - 1) handleReorderShooter?.(shooterIdx, shooterIdx + 1)
    }
  }

  const handlePointerMove = (e) => {
    if (dragIdx === null) return
    if (typeof document.elementFromPoint !== 'function') return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const rowEl = el?.closest?.('[data-shooter-idx]')
    if (rowEl) {
      const targetIdx = Number(rowEl.getAttribute('data-shooter-idx'))
      if (Number.isInteger(targetIdx) && targetIdx !== overIdx) {
        setOverIdx(targetIdx)
      }
    }
  }

  return (
    <div className="w-full lg:w-56 xl:w-64 bg-white border-b lg:border-b-0 lg:border-r border-gray-200 flex-shrink-0 flex flex-col overflow-hidden">
      <div className="p-2 border-b border-gray-200 flex-shrink-0">
        <h3 className="font-semibold text-gray-700 text-xs">{squad.name}</h3>
        <p className="text-xs text-gray-500">{squad.shooters.length} {t.shooters}</p>
      </div>
      <div role="listbox" aria-label={t.selectShooter} className="divide-y divide-gray-100 overflow-y-auto flex-1">
        {squad.shooters.map((shooter, shooterIdx) => {
          const isSelected = selectedShooter?.id === shooter.id
          const isDragging = dragIdx === shooterIdx
          const isDropTarget = overIdx === shooterIdx && dragIdx !== null && dragIdx !== shooterIdx
          const shooterScores = allScores[shooter.id]
          const shooterShots = shooterScores ? getTotalHits(shooterScores) : 0
          const shooterPoints = shooterScores ? getTotalPoints(shooterScores) : 0

          return (
            <div
              key={shooter.id}
              data-shooter-idx={shooterIdx}
              role="option"
              aria-selected={isSelected}
              aria-label={`${shooter.number}. ${shooter.name}, ${shooterPoints} ${t.pts}, ${shooterShots}/${totalShotsInMatch}`}
              tabIndex={0}
              draggable={armedIdx === shooterIdx}
              onDragStart={(e) => {
                if (armedIdx !== shooterIdx) {
                  e.preventDefault()
                  return
                }
                setDragIdx(shooterIdx)
                setOverIdx(shooterIdx)
                e.dataTransfer?.setData?.('text/plain', String(shooterIdx))
              }}
              onDragOver={(e) => {
                if (dragIdx === null) return
                e.preventDefault()
                if (overIdx !== shooterIdx) setOverIdx(shooterIdx)
              }}
              onDrop={(e) => {
                e.preventDefault()
                const fromIdx = dragIdx ?? Number(e.dataTransfer?.getData?.('text/plain'))
                if (Number.isInteger(fromIdx)) {
                  commitDrop(fromIdx, shooterIdx)
                } else {
                  resetDragState()
                }
              }}
              onDragEnd={resetDragState}
              onClick={() => handleShooterSelect(shooter)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleShooterSelect(shooter) } }}
              className={`p-1.5 cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-blue-50 border-l-4 border-blue-600'
                  : 'hover:bg-gray-50 border-l-4 border-transparent'
              } ${isDragging ? 'opacity-50' : ''} ${isDropTarget ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/70' : ''}`}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  data-testid={`drag-handle-${shooter.id}`}
                  aria-label={`Reorder ${shooter.name}`}
                  title="Vedä järjestääksesi / Drag to reorder"
                  onMouseDown={(e) => { e.stopPropagation(); setArmedIdx(shooterIdx) }}
                  onMouseUp={(e) => { e.stopPropagation(); if (dragIdx === null) setArmedIdx(null) }}
                  onTouchStart={(e) => { e.stopPropagation(); setArmedIdx(shooterIdx); setDragIdx(shooterIdx); setOverIdx(shooterIdx) }}
                  onTouchMove={handlePointerMove}
                  onTouchEnd={(e) => { e.stopPropagation(); commitDrop(dragIdx, overIdx) }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => handleHandleKeyDown(e, shooterIdx)}
                  className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-gray-600 active:text-blue-600 cursor-grab active:cursor-grabbing touch-none select-none shrink-0 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="3.5" r="1.3" />
                    <circle cx="11" cy="3.5" r="1.3" />
                    <circle cx="5" cy="8" r="1.3" />
                    <circle cx="11" cy="8" r="1.3" />
                    <circle cx="5" cy="12.5" r="1.3" />
                    <circle cx="11" cy="12.5" r="1.3" />
                  </svg>
                </button>
                <div className="flex-1 min-w-0 ml-1">
                  <div className={`text-xs font-medium truncate ${
                    isSelected ? 'text-blue-900' : 'text-gray-900'
                  }`}>
                    {shooter.number}. {shooter.name}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{shooter.division}</div>
                </div>
                <div className="ml-2 text-right pr-1">
                  <div className={`text-sm font-bold ${
                    isSelected ? 'text-blue-600' : 'text-gray-700'
                  }`}>
                    {shooterPoints}
                  </div>
                  <div className="text-xs text-gray-400">
                    {shooterShots}/{totalShotsInMatch}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function TabletNumberPad({ selectedShooter, isMatchCompleted, handleScoreAdd }) {
  return (
    <div className="w-full lg:w-64 xl:w-72 bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex-shrink-0 flex flex-col overflow-hidden">
      <div className="p-2 border-b border-gray-200 flex-shrink-0">
        <h3 className="font-semibold text-gray-700 text-xs">Score Pad</h3>
      </div>
      <div className="p-2 flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 gap-2">
          {SCORE_ZONES.map((zone) => {
            const variant = zone === 'X' || zone === '10' ? 'high' : zone === 'M' ? 'miss' : 'low'
            const colors = {
              high: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white',
              low: 'bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white',
              miss: 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white',
            }

            return (
              <button
                key={zone}
                onClick={() => handleScoreAdd(zone)}
                disabled={!selectedShooter || isMatchCompleted}
                aria-label={`${zone === 'M' ? 'Miss' : `Score ${zone}`}`}
                className={`h-16 lg:h-14 xl:h-16 rounded-lg font-bold text-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation ${colors[variant]}`}
              >
                {zone}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

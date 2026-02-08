export default function ScoreZoneButton({ zone, count, onIncrement, onDecrement, variant = 'high', incrementDisabled = false }) {
  const colors = {
    high: {
      bg: 'bg-white',
      border: 'border-gray-200',
      label: 'text-gray-800',
      count: 'text-blue-600',
      plus: 'bg-blue-600 active:bg-blue-700',
      minus: 'bg-red-500 active:bg-red-600',
    },
    low: {
      bg: 'bg-gray-50',
      border: 'border-gray-200',
      label: 'text-gray-500',
      count: 'text-gray-700',
      plus: 'bg-blue-500 active:bg-blue-600',
      minus: 'bg-red-400 active:bg-red-500',
    },
    miss: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      label: 'text-red-600',
      count: 'text-red-600',
      plus: 'bg-red-600 active:bg-red-700',
      minus: 'bg-red-400 active:bg-red-500',
    },
  }

  const c = colors[variant]

  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-2 flex flex-col items-center`}>
      {/* Zone label */}
      <span className={`text-xs font-bold ${c.label} mb-1`}>{zone}</span>

      {/* Count display */}
      <span className={`text-2xl font-bold ${c.count} mb-2 min-w-[2ch] text-center`}>
        {count}
      </span>

      {/* +/- buttons - large tap targets */}
      <div className="flex gap-2 w-full">
        <button
          type="button"
          onClick={onDecrement}
          disabled={count === 0}
          aria-label={`Decrease ${zone}`}
          className={`flex-1 h-11 rounded-lg text-white font-bold text-xl ${c.minus} disabled:opacity-30 disabled:active:bg-inherit`}
        >
          −
        </button>
        <button
          type="button"
          onClick={onIncrement}
          disabled={incrementDisabled}
          aria-label={`Increase ${zone}`}
          className={`flex-1 h-11 rounded-lg text-white font-bold text-xl ${c.plus} disabled:opacity-30 disabled:active:bg-inherit`}
        >
          +
        </button>
      </div>
    </div>
  )
}

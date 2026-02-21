// ── Action button with loading spinner ──
export default function ActionButton({ label, loading, onClick, color = 'blue' }) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-700 active:bg-blue-200',
    amber: 'bg-amber-100 text-amber-700 active:bg-amber-200',
    purple: 'bg-purple-100 text-purple-700 active:bg-purple-200',
    red: 'bg-red-100 text-red-700 active:bg-red-200',
  }
  if (loading) {
    return (
      <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-400 flex items-center gap-1">
        <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      </span>
    )
  }
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0 ${colorClasses[color] || colorClasses.blue}`}
    >
      {label}
    </button>
  )
}

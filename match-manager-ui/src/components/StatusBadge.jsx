import { getStatusColor, getStatusLabel } from '../data/mockData'

function StatusBadge({ status, pulse = false }) {
  const color = getStatusColor(status)
  const label = getStatusLabel(status)
  
  const colorClasses = {
    red: 'bg-red-100 text-red-700 border-red-200',
    yellow: 'bg-amber-100 text-amber-700 border-amber-200',
    green: 'bg-green-100 text-green-700 border-green-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    gray: 'bg-gray-100 text-gray-700 border-gray-200'
  }

  return (
    <span className={`
      inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border
      ${colorClasses[color] || colorClasses.gray}
    `}>
      {pulse && status === 'live' && (
        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      )}
      {label}
    </span>
  )
}

export default StatusBadge

function ProgressBar({ current, max, size = 'md', color = 'blue' }) {
  const percentage = Math.min(100, Math.round((current / max) * 100))
  
  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3'
  }
  
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-amber-500',
    red: 'bg-red-500'
  }

  return (
    <div className="w-full">
      <div className={`w-full bg-gray-200 rounded-full ${sizeClasses[size]}`}>
        <div 
          className={`${sizeClasses[size]} ${colorClasses[color]} rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>{current}/{max}</span>
        <span>{percentage}%</span>
      </div>
    </div>
  )
}

export default ProgressBar

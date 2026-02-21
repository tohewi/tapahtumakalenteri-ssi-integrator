// ── Inline DNS + Paid buttons for a shooter (CUP2/CUP3) ──
export default function ShooterActions({ shooter, actionLoading, onSetDns, onUndoDns, onTogglePaid }) {
  const isDnsLoading = actionLoading?.shooterName === shooter.name && (actionLoading?.action === 'dns' || actionLoading?.action === 'undoDns')
  const isPaidLoading = actionLoading?.shooterName === shooter.name && actionLoading?.action === 'paid'

  return (
    <div className="flex items-center gap-1 mt-1">
      {/* Paid toggle */}
      {shooter.cupParticipantId && (
        <button
          onClick={() => onTogglePaid(shooter)}
          disabled={isPaidLoading}
          aria-label={shooter.paid ? `${shooter.name}: maksettu` : `${shooter.name}: ei maksettu`}
          title={shooter.paid ? `${shooter.name}: maksettu` : `${shooter.name}: ei maksettu`}
          className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
            shooter.paid
              ? 'bg-green-500 text-white active:bg-green-600'
              : 'bg-gray-100 text-gray-400 active:bg-gray-200'
          }`}
        >
          {isPaidLoading ? '...' : (shooter.paid ? '€ ✓' : '€')}
        </button>
      )}
      {/* DNS toggle */}
      {shooter.cupParticipantId && (
        <button
          onClick={() => shooter.didNotShow ? onUndoDns(shooter) : onSetDns(shooter)}
          disabled={isDnsLoading}
          aria-label={shooter.didNotShow ? `${shooter.name}: peru DNS` : `${shooter.name}: aseta DNS`}
          className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
            shooter.didNotShow
              ? 'bg-red-100 text-red-700 active:bg-red-200'
              : 'bg-gray-100 text-gray-400 active:bg-gray-200'
          }`}
        >
          {isDnsLoading ? '...' : (shooter.didNotShow ? 'DNS ✗' : 'DNS')}
        </button>
      )}
    </div>
  )
}

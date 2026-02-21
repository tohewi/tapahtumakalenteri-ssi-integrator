// ── Section header ──
export default function SectionHeader({ icon, title, count, color }) {
  const colors = {
    red: 'text-red-700',
    amber: 'text-amber-700',
    purple: 'text-purple-700',
    blue: 'text-blue-700',
    green: 'text-green-700',
  }
  return (
    <h2 className={`text-sm font-semibold uppercase tracking-wide mb-2 px-1 flex items-center gap-2 ${colors[color] || 'text-gray-700'}`}>
      <span>{icon}</span>
      <span>{title}</span>
      <span className="text-xs font-normal opacity-70">({count})</span>
    </h2>
  )
}

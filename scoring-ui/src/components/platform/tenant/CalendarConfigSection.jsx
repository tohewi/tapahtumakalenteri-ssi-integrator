// CalendarConfigSection — WordPress / Tapahtumakalenteri integration (placeholder)

import { SectionCard } from './shared.jsx'

export default function CalendarConfigSection() {
  return (
    <SectionCard
      title="Calendar Integration"
      description="WordPress / Tapahtumakalenteri settings for publishing events to your club calendar."
    >
      <div className="bg-gray-50 rounded-lg p-4 border border-dashed border-gray-300 text-center">
        <p className="text-sm text-gray-400">
          Calendar integration configuration is coming in a future update.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          This will allow automatic publishing of match events to your club's WordPress calendar.
        </p>
      </div>
    </SectionCard>
  )
}

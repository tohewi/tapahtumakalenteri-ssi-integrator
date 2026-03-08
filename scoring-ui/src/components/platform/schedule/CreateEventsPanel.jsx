// ============================================================
// CreateEventsPanel — Template selector + date picker + batch creation
// ============================================================

import { formatEventDate } from './StatusBadge'

export default function CreateEventsPanel({
  templates,
  selectedTemplateId,
  onTemplateChange,
  dateInput,
  onDateInputChange,
  dates,
  onAddDate,
  onRemoveDate,
  creating,
  onCreate,
  batchResults,
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Schedule New Events</h2>

      {/* Template selector */}
      <div>
        <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Template</label>
        <select
          value={selectedTemplateId}
          onChange={e => onTemplateChange(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
        >
          <option value="">Select template...</option>
          {templates.filter(t => t.ssiSeedSnapshot).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        {templates.length > 0 && templates.filter(t => t.ssiSeedSnapshot).length === 0 && (
          <p className="text-xs text-amber-600 mt-1">No templates have imported seed events yet. Import a seed first.</p>
        )}
      </div>

      {/* Date picker */}
      {selectedTemplateId && (
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Add Dates</label>
          <div className="flex gap-2">
            <input
              type="date" value={dateInput}
              onChange={e => onDateInputChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAddDate() } }}
              min={new Date().toISOString().split('T')[0]}
              className="flex-1 border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
            />
            <button
              onClick={onAddDate} disabled={!dateInput}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              + Add
            </button>
          </div>

          {/* Selected dates */}
          {dates.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-xs text-gray-500 font-medium">{dates.length} date{dates.length > 1 ? 's' : ''} selected:</div>
              <div className="flex flex-wrap gap-2">
                {dates.map(d => (
                  <span key={d} className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 px-3 py-1 rounded-full text-sm">
                    {formatEventDate(d)}
                    <button onClick={() => onRemoveDate(d)} className="text-sky-400 hover:text-sky-600 ml-1">×</button>
                  </span>
                ))}
              </div>
              <button
                onClick={onCreate} disabled={creating}
                className="mt-3 bg-sky-600 text-white px-6 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating...' : `Create ${dates.length} Event${dates.length > 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Batch results */}
      {batchResults && (
        <div className="mt-4 space-y-1 border-t pt-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Creation Results</div>
          {batchResults.map((r, i) => (
            <div key={i} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded ${
              r.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              <span>{r.success ? '✓' : '✗'}</span>
              <span>{formatEventDate(r.date)}</span>
              {!r.success && <span className="text-xs">— {r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

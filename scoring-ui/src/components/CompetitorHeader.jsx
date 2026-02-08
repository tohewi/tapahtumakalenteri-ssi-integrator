import fi from '../i18n'

export default function CompetitorHeader({ competitor, grandTotal, totalHits }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{competitor.number}. {competitor.name}</h1>
          <p className="text-blue-200 text-sm">{competitor.division}</p>
          <p className="text-blue-300 text-xs">{competitor.matchName}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold">{grandTotal}</div>
          <div className="text-blue-200 text-xs">{totalHits} {fi.hits}</div>
        </div>
      </div>
      {competitor.onDeck && (
        <div className="mt-2 bg-blue-800/50 rounded-lg px-3 py-1.5 text-sm flex items-center justify-between">
          <span className="text-blue-200">On deck:</span>
          <span className="font-medium">{competitor.onDeck.number}. {competitor.onDeck.name}</span>
        </div>
      )}
    </div>
  )
}

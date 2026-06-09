import { useState } from 'react'
import { useParams, Link, NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { 
  ArrowLeft, 
  MoreVertical,
  MapPin,
  Clock,
  Target,
  Users,
  UserCircle,
  Settings,
  BarChart3,
  Rocket,
  Plus,
  CheckCircle,
  XCircle,
  Mail,
  ChevronRight
} from 'lucide-react'
import { getEventById, formatDate, formatDateRelative } from '../data/mockData'
import StatusBadge from '../components/StatusBadge'
import ProgressBar from '../components/ProgressBar'

// Tab configuration
const tabs = [
  { id: 'overview', label: 'Overview', path: '' },
  { id: 'personnel', label: 'Personnel', path: 'personnel' },
  { id: 'registration', label: 'Registration', path: 'registration' },
  { id: 'scoring', label: 'Scoring', path: 'scoring' },
  { id: 'reports', label: 'Reports', path: 'reports' }
]

function EventDetail() {
  const { eventId } = useParams()
  const event = getEventById(eventId)

  if (!event) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Event not found</h1>
        <Link to="/events" className="text-blue-600 hover:underline">
          Back to events
        </Link>
      </div>
    )
  }

  return (
    <div className="pb-20 lg:pb-0">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-14 lg:top-[7.5rem] z-40">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link 
              to="/events"
              className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </Link>
            <div>
              <h1 className="font-bold text-gray-900 truncate max-w-[200px] sm:max-w-md">
                {event.name}
              </h1>
              <p className="text-xs text-gray-500">
                {formatDateRelative(event.date)}
              </p>
            </div>
          </div>
          <button className="p-2 hover:bg-gray-100 rounded-lg">
            <MoreVertical className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Tab Navigation */}
        <nav className="flex overflow-x-auto scrollbar-hide border-t border-gray-100">
          {tabs.map(tab => (
            <NavLink
              key={tab.id}
              to={`/events/${eventId}/${tab.path}`}
              end={tab.path === ''}
              className={({ isActive }) => `
                flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${isActive 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900'}
              `}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Tab Content */}
      <div className="p-4 lg:p-6 max-w-6xl mx-auto">
        <Routes>
          <Route index element={<OverviewTab event={event} />} />
          <Route path="personnel" element={<PersonnelTab event={event} />} />
          <Route path="registration" element={<RegistrationTab event={event} />} />
          <Route path="scoring" element={<ScoringTab event={event} />} />
          <Route path="reports" element={<ReportsTab event={event} />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </div>
    </div>
  )
}

// Overview Tab
function OverviewTab({ event }) {
  return (
    <div className="space-y-4">
      {/* Status Banner */}
      {event.status === 'live' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <span className="inline-flex items-center gap-2 text-red-700 font-bold">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            LIVE — Scoring in progress
          </span>
        </div>
      )}

      {/* Quick Stats Card */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Quick Stats
        </h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">{event.stats.shooters}</div>
            <div className="text-xs text-gray-500">Shooters</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">{event.stats.scoresSubmitted}</div>
            <div className="text-xs text-gray-500">Scores</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{event.stats.dnfs}</div>
            <div className="text-xs text-gray-500">DNFs</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">{event.stats.activeSquads}/{event.stats.totalSquads}</div>
            <div className="text-xs text-gray-500">Squads</div>
          </div>
        </div>
        <button 
          onClick={() => alert('View full results')}
          className="w-full py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          View Full Results →
        </button>
      </div>

      {/* Event Info */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Event Details
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-700">
            <MapPin className="w-4 h-4 text-gray-400" />
            {event.location} {event.locationDetail && `• ${event.locationDetail}`}
          </div>
          <div className="flex items-center gap-2 text-gray-700">
            <Clock className="w-4 h-4 text-gray-400" />
            {formatDate(event.date)} • {event.time}–{event.endTime}
          </div>
          <div className="flex items-center gap-2 text-gray-700">
            <Target className="w-4 h-4 text-gray-400" />
            {event.matches.length} matches
          </div>
        </div>
      </div>

      {/* Matches */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Matches ({event.matches.length})
        </h2>
        <div className="space-y-2">
          {event.matches.map(match => (
            <div 
              key={match.id}
              className="bg-white border border-gray-200 rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{match.name}</h3>
                <span className="text-xs text-gray-500">{match.discipline}</span>
              </div>
              <div className="text-sm text-gray-600 mb-3">
                {match.shots} shots • {match.format}
              </div>
              <div className="flex items-center gap-2">
                <ProgressBar 
                  current={match.scores} 
                  max={match.maxScores}
                  size="sm"
                />
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {match.scores}/{match.maxScores}
                </span>
              </div>
              <button 
                onClick={() => alert(`View results for ${match.name}`)}
                className="mt-3 w-full py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                {match.scores > 0 ? 'View Results' : 'Start Scoring'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Personnel Tab
function PersonnelTab({ event }) {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Personnel
        </h2>
        <div className="space-y-3">
          {event.personnel.map(person => (
            <div 
              key={person.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div>
                <div className="font-medium text-gray-900">{person.role}</div>
                <div className="text-sm text-gray-600">
                  {person.name || '(Vacant)'}
                </div>
                {person.status === 'confirmed' && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="w-3 h-3" />
                    Confirmed
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {person.email && (
                  <button 
                    onClick={() => alert(`Email ${person.name}`)}
                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <Mail className="w-4 h-4 text-gray-600" />
                  </button>
                )}
                <button 
                  onClick={() => alert(`Remove ${person.role}`)}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <XCircle className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
        
        {/* Vacant Roles */}
        {event.personnel.some(p => p.status === 'vacant') && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <button 
              onClick={() => alert('Invite personnel')}
              className="w-full py-2 flex items-center justify-center gap-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Invite Personnel
            </button>
          </div>
        )}
      </div>

      {/* Available Staff Pool */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Available Staff
        </h2>
        <div className="text-center py-6 text-gray-500">
          <UserCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No staff marked available for this date</p>
        </div>
      </div>
    </div>
  )
}

// Registration Tab
function RegistrationTab({ event }) {
  return (
    <div className="space-y-4">
      {/* Capacity */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Registration
          </h2>
          <span className="text-lg font-bold text-gray-900">
            {event.stats.shooters}/{event.stats.maxShooters}
          </span>
        </div>
        <ProgressBar 
          current={event.stats.shooters} 
          max={event.stats.maxShooters}
          color={event.stats.shooters >= event.stats.maxShooters ? 'red' : 'blue'}
        />
      </div>

      {/* Register Button */}
      <button 
        onClick={() => alert('Open registration form')}
        className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-5 h-5" />
        Register Shooter
      </button>

      {/* Squads */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Squads ({event.squads.length})
        </h2>
        <div className="space-y-2">
          {event.squads.map(squad => (
            <div 
              key={squad.id}
              className="bg-white border border-gray-200 rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⬜</span>
                  <h3 className="font-semibold text-gray-900">Squad {squad.number}</h3>
                </div>
                <span className={`text-sm ${
                  squad.status === 'shooting' ? 'text-red-600 font-medium' : 'text-gray-500'
                }`}>
                  {squad.shooters}/{squad.maxShooters}
                  {squad.status === 'shooting' && ' 🔴 LIVE'}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${
                    squad.status === 'completed' ? 'bg-green-500' :
                    squad.status === 'shooting' ? 'bg-red-500' :
                    squad.status === 'filled' ? 'bg-amber-500' :
                    'bg-gray-300'
                  }`}
                  style={{ width: `${(squad.shooters / squad.maxShooters) * 100}%` }}
                />
              </div>
              <div className="flex gap-2 mt-3">
                <button 
                  onClick={() => alert(`Manage squad ${squad.number}`)}
                  className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Manage
                </button>
                {squad.status === 'shooting' && (
                  <button 
                    onClick={() => alert(`Start scoring for squad ${squad.number}`)}
                    className="flex-1 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                  >
                    Score
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Waitlist */}
      {event.waitlist.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Waitlist ({event.waitlist.length})
          </h2>
          <div className="space-y-2">
            {event.waitlist.map(person => (
              <div 
                key={person.id}
                className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg"
              >
                <span className="font-medium text-gray-900">{person.name}</span>
                <button 
                  onClick={() => alert(`Promote ${person.name} to squad`)}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  Promote →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auto Assign */}
      <button 
        onClick={() => alert('Auto-assign shooters to squads')}
        className="w-full py-3 border-2 border-dashed border-gray-300 text-gray-600 rounded-xl font-medium hover:border-gray-400 hover:text-gray-900 transition-colors"
      >
        Auto-Assign Squads
      </button>
    </div>
  )
}

// Scoring Tab
function ScoringTab({ event }) {
  return (
    <div className="space-y-4">
      {/* Match Selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Select Match
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {event.matches.map((match, idx) => (
            <button
              key={match.id}
              onClick={() => alert(`Selected ${match.name}`)}
              className={`flex-shrink-0 p-4 rounded-xl border-2 text-left min-w-[140px] ${
                idx === 2 ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="font-semibold text-gray-900">{match.name}</div>
              <div className="text-sm text-gray-500">
                {match.scores}/{match.maxScores} scores
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Current Squad */}
      {event.status === 'live' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700 font-semibold mb-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Squad 3 shooting now
          </div>
          <p className="text-sm text-red-600">15 min remaining • 5 shooters waiting</p>
        </div>
      )}

      {/* Launch Scoring */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Launch Scoring
        </h2>
        
        {/* Tablet Mode */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Target className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Tablet Mode</h3>
              <p className="text-sm text-gray-500">10\"+ screens • Optimized for range use</p>
            </div>
          </div>
          <button 
            onClick={() => alert('Launch tablet scoring')}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
          >
            <Rocket className="w-5 h-5 inline mr-2" />
            Launch Tablet Scoring
          </button>
        </div>

        {/* Mobile Mode */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Rocket className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Mobile Mode</h3>
              <p className="text-sm text-gray-500">Phone or tablet • Compact view</p>
            </div>
          </div>
          <button 
            onClick={() => alert('Launch mobile scoring')}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors"
          >
            <Rocket className="w-5 h-5 inline mr-2" />
            Launch Mobile Scoring
          </button>
        </div>
      </div>

      {/* Download Results */}
      <button 
        onClick={() => alert('Download results CSV')}
        className="w-full py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
      >
        <BarChart3 className="w-5 h-5" />
        Download Results
      </button>
    </div>
  )
}

// Reports Tab
function ReportsTab({ event }) {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Post-Match Reports
        </h2>
        
        <div className="space-y-3">
          <button 
            onClick={() => alert('Generate results summary')}
            className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">Results Summary</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
          
          <button 
            onClick={() => alert('View statistics')}
            className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">Statistics</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
          
          <button 
            onClick={() => alert('Export for Tapahtumakalenteri')}
            className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">Export for Tapahtumakalenteri</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {event.status !== 'closed' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-sm text-amber-800">
            Reports available after event is closed
          </p>
        </div>
      )}
    </div>
  )
}

export default EventDetail

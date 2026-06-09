import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, MapPin, Clock, Users, Target, Settings, BarChart3, UserCircle } from 'lucide-react'
import { mockEvents, formatDateRelative, formatDate } from '../data/mockData'
import StatusBadge from '../components/StatusBadge'
import ProgressBar from '../components/ProgressBar'

function EventsList() {
  const [activeTab, setActiveTab] = useState('upcoming')
  const events = mockEvents

  const filteredEvents = events.filter(e => {
    if (activeTab === 'upcoming') return e.status !== 'archived' && e.status !== 'closed'
    if (activeTab === 'past') return e.status === 'archived' || e.status === 'closed'
    return true
  })

  const getEventCardColor = (status) => {
    switch (status) {
      case 'live': return 'border-red-300 bg-red-50/30'
      case 'upcoming': return 'border-amber-300 bg-amber-50/30'
      case 'draft': return 'border-gray-300 bg-gray-50'
      default: return 'border-gray-200 bg-white'
    }
  }

  return (
    <div className="p-4 pb-24 lg:p-6 lg:pb-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Events</h1>
        
        {/* Tab Switcher */}
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'upcoming' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Upcoming
          </button>
          <button
            onClick={() => setActiveTab('past')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'past' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Past
          </button>
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-4">
        {filteredEvents.map(event => (
          <Link 
            key={event.id}
            to={`/events/${event.id}`}
            className={`block rounded-xl border-2 p-4 transition-all hover:shadow-md active:scale-[0.99] ${getEventCardColor(event.status)}`}
          >
            {/* Status Row */}
            <div className="flex items-center justify-between mb-3">
              <StatusBadge status={event.status} pulse={event.status === 'live'} />
              <span className="text-sm font-medium text-gray-600">
                {formatDateRelative(event.date)}
              </span>
            </div>

            {/* Event Title */}
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              {event.name}
            </h2>

            {/* Location & Time */}
            <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-3">
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {event.location}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {event.time}
              </span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm mb-3">
              <span className="flex items-center gap-1 text-gray-700">
                <Target className="w-4 h-4" />
                {event.matches.length} matches
              </span>
              <span className="flex items-center gap-1 text-gray-700">
                <Users className="w-4 h-4" />
                {event.stats.shooters}/{event.stats.maxShooters}
              </span>
            </div>

            {/* Capacity Bar */}
            <div className="mb-4">
              <ProgressBar 
                current={event.stats.shooters} 
                max={event.stats.maxShooters}
                size="sm"
                color={event.stats.shooters >= event.stats.maxShooters ? 'red' : 'blue'}
              />
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  alert(`Open manage for ${event.name}`)
                }}
                className="flex-1 min-w-[80px] px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <Settings className="w-4 h-4 inline mr-1" />
                Manage
              </button>
              
              {event.status === 'live' && (
                <button 
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    alert(`Launch scoring for ${event.name}`)
                  }}
                  className="flex-1 min-w-[80px] px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors"
                >
                  <Target className="w-4 h-4 inline mr-1" />
                  Score
                </button>
              )}
              
              <button 
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  alert(`Open staff for ${event.name}`)
                }}
                className="flex-1 min-w-[80px] px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <UserCircle className="w-4 h-4 inline mr-1" />
                Staff
              </button>
              
              {event.status === 'closed' && (
                <button 
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    alert(`View results for ${event.name}`)
                  }}
                  className="flex-1 min-w-[80px] px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <BarChart3 className="w-4 h-4 inline mr-1" />
                  Results
                </button>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* Empty State */}
      {filteredEvents.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No events</h3>
          <p className="text-gray-500 mb-4">Create your first event to get started</p>
        </div>
      )}

      {/* Create Event FAB (Mobile) */}
      <Link
        to="/events/new"
        className="lg:hidden fixed bottom-20 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 active:bg-blue-800 active:scale-95 transition-all z-40"
      >
        <Plus className="w-6 h-6" />
      </Link>

      {/* Create Event Button (Desktop) */}
      <div className="hidden lg:block mt-6">
        <Link
          to="/events/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create New Event
        </Link>
      </div>
    </div>
  )
}

export default EventsList

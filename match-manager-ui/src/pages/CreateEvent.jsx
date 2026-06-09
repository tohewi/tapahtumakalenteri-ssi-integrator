import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Check, Calendar, Clock, MapPin, Target, Users, Edit2 } from 'lucide-react'
import { trainingTypes } from '../data/mockData'

const steps = [
  { id: 1, label: 'Type' },
  { id: 2, label: 'Date' },
  { id: 3, label: 'Review' },
  { id: 4, label: 'Publish' }
]

function CreateEvent() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState({
    trainingType: 'kupittaa-cup',
    date: '2026-06-29',
    time: '09:00',
    location: 'Kupittaa',
    locationDetail: 'Rata 1-5',
    publish: 'draft'
  })

  const selectedType = trainingTypes.find(t => t.id === formData.trainingType)

  const handleNext = () => {
    if (currentStep < 4) setCurrentStep(currentStep + 1)
  }

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  const handleCreate = () => {
    const action = formData.publish === 'live' ? 'create and publish' : 'save as draft'
    alert(`Will ${action}: ${selectedType.name} on ${formData.date}`)
    navigate('/events')
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 lg:top-14 z-40">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link 
              to="/events"
              className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </Link>
            <h1 className="font-bold text-gray-900">Create Event</h1>
          </div>
          <span className="text-sm font-medium text-gray-500">
            {currentStep}/{steps.length}
          </span>
        </div>

        {/* Step Progress */}
        <div className="flex px-4 pb-3 gap-1">
          {steps.map(step => (
            <div 
              key={step.id}
              className={`h-1 flex-1 rounded-full ${
                step.id <= currentStep ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </header>

      {/* Step Content */}
      <div className="p-4 max-w-lg mx-auto">
        {currentStep === 1 && (
          <Step1TrainingType 
            value={formData.trainingType}
            onChange={(value) => setFormData({ ...formData, trainingType: value })}
          />
        )}
        {currentStep === 2 && (
          <Step2DateLocation 
            value={formData}
            onChange={(updates) => setFormData({ ...formData, ...updates })}
          />
        )}
        {currentStep === 3 && (
          <Step3Review 
            formData={formData}
            trainingType={selectedType}
          />
        )}
        {currentStep === 4 && (
          <Step4Publish 
            value={formData.publish}
            onChange={(value) => setFormData({ ...formData, publish: value })}
          />
        )}
      </div>

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 lg:relative lg:border-t-0 lg:bg-transparent lg:p-0 lg:mt-6 z-40">
        <div className="max-w-lg mx-auto flex gap-3">
          {currentStep > 1 ? (
            <button
              onClick={handleBack}
              className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              ← Back
            </button>
          ) : (
            <Link
              to="/events"
              className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors text-center"
            >
              Cancel
            </Link>
          )}
          
          {currentStep < 4 ? (
            <button
              onClick={handleNext}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleCreate}
              className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                formData.publish === 'live'
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              }`}
            >
              {formData.publish === 'live' ? '🚀 Create & Publish' : 'Save Draft'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Step 1: Select Training Type
function Step1TrainingType({ value, onChange }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Select Training Type</h2>
      <p className="text-sm text-gray-500">Choose the event template</p>

      <div className="space-y-3">
        {trainingTypes.map(type => (
          <button
            key={type.id}
            onClick={() => onChange(type.id)}
            className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
              value === type.id 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{type.icon}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">{type.name}</h3>
                  {value === type.id && (
                    <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">{type.description}</p>
                <div className="text-xs text-gray-400 mt-2">
                  {type.defaultMatches.length} matches • {type.defaultSquads} squads
                </div>
              </div>
            </div>
          </button>
        ))}
        
        <button
          onClick={() => alert('Custom event creation coming soon')}
          className="w-full p-4 rounded-xl border-2 border-dashed border-gray-300 text-center text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
        >
          <span className="font-medium">+ Custom Event...</span>
          <p className="text-sm mt-1">Define your own structure</p>
        </button>
      </div>
    </div>
  )
}

// Step 2: Date & Location
function Step2DateLocation({ value, onChange }) {
  const selectedType = trainingTypes.find(t => t.id === value.trainingType)

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-900">Date & Location</h2>

      {/* Date Picker (simplified) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Calendar className="w-4 h-4 inline mr-1" />
          Date
        </label>
        <input
          type="date"
          value={value.date}
          onChange={(e) => onChange({ date: e.target.value })}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>

      {/* Time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Clock className="w-4 h-4 inline mr-1" />
            Start Time
          </label>
          <input
            type="time"
            value={value.time}
            onChange={(e) => onChange({ time: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            End Time
          </label>
          <input
            type="time"
            value="14:00"
            readOnly
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-100 text-gray-500"
          />
        </div>
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <MapPin className="w-4 h-4 inline mr-1" />
          Location
        </label>
        <input
          type="text"
          value={value.location}
          onChange={(e) => onChange({ location: e.target.value })}
          placeholder={selectedType?.defaultLocation || 'Location'}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none mb-2"
        />
        <input
          type="text"
          value={value.locationDetail}
          onChange={(e) => onChange({ locationDetail: e.target.value })}
          placeholder="Details (e.g., Rata 1-5)"
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>

      {/* Quick Presets */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Quick Presets
        </label>
        <div className="flex flex-wrap gap-2">
          {['09:00', '10:00', '18:00'].map(time => (
            <button
              key={time}
              onClick={() => onChange({ time })}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors"
            >
              {time}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Step 3: Review Structure
function Step3Review({ formData, trainingType }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Review Match Structure</h2>

      {/* Event Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-semibold text-blue-900">{trainingType.name}</h3>
        <p className="text-sm text-blue-700 mt-1">
          <MapPin className="w-4 h-4 inline mr-1" />
          {formData.location} • {formData.date} • {formData.time}
        </p>
      </div>

      {/* Matches */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          <Target className="w-4 h-4 inline mr-1" />
          Matches ({trainingType.defaultMatches.length})
        </h3>
        <div className="space-y-2">
          {trainingType.defaultMatches.map((match, idx) => (
            <div 
              key={idx}
              className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl"
            >
              <div>
                <span className="text-gray-400 mr-2">{idx + 1}.</span>
                <span className="font-medium text-gray-900">{match.name}</span>
                <span className="text-sm text-gray-500 ml-2">
                  {match.shots ? `${match.shots} shots` : 'Stage'} • {match.format}
                </span>
              </div>
              <button 
                onClick={() => alert(`Edit ${match.name}`)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Edit2 className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Squads */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          <Users className="w-4 h-4 inline mr-1" />
          Squad Configuration
        </h3>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">
                {trainingType.defaultSquads} squads
              </div>
              <div className="text-sm text-gray-500">
                Max {trainingType.maxPerSquad} shooters per squad
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">
                Total capacity: {trainingType.defaultSquads * trainingType.maxPerSquad}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Note */}
      <p className="text-sm text-gray-500 text-center">
        You can edit details after creation
      </p>
    </div>
  )
}

// Step 4: Create & Publish
function Step4Publish({ value, onChange }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Ready to Create</h2>
      <p className="text-sm text-gray-500">Choose how to publish this event</p>

      <div className="space-y-3">
        <button
          onClick={() => onChange('live')}
          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
            value === 'live' 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">🚀</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Create & Publish</h3>
                {value === 'live' && (
                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Go live immediately. Event visible to all, registration opens.
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => onChange('draft')}
          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
            value === 'draft' 
              ? 'border-gray-500 bg-gray-50' 
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">📝</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Save as Draft</h3>
                {value === 'draft' && (
                  <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Save but don't publish yet. You can edit and publish later.
              </p>
            </div>
          </div>
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h4 className="font-medium text-amber-800 mb-1">This will:</h4>
        <ul className="text-sm text-amber-700 space-y-1">
          <li>• Create Cup in SSI</li>
          <li>• Create {trainingTypes.find(t => t.id === 'kupittaa-cup')?.defaultMatches.length} matches</li>
          <li>• Create {trainingTypes.find(t => t.id === 'kupittaa-cup')?.defaultSquads} squads</li>
          <li>• {value === 'live' ? 'Add to calendar & open registration' : 'Save for later'}</li>
        </ul>
      </div>
    </div>
  )
}

export default CreateEvent

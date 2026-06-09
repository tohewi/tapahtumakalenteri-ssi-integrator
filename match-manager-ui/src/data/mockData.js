// Mock data for R8.1 clickable prototype

export const mockEvents = [
  {
    id: 'cup-001',
    type: 'kupittaa-cup',
    name: 'Kupittaa CUP',
    date: '2026-06-15',
    time: '09:00',
    endTime: '14:00',
    location: 'Kupittaa',
    locationDetail: 'Rata 1-5',
    status: 'live',
    description: 'Kolmen lajin cup: 25m pistooli, 50m ja 100m pienoiskivääri',
    stats: {
      shooters: 12,
      maxShooters: 20,
      scoresSubmitted: 45,
      dnfs: 2,
      activeSquads: 3,
      totalSquads: 5
    },
    matches: [
      { id: 'm1', name: '25m Pistol', discipline: 'pistol', shots: 50, format: '5×6', scores: 8, maxScores: 12 },
      { id: 'm2', name: '50m Rifle', discipline: 'rifle', shots: 40, format: '5×6', scores: 6, maxScores: 12 },
      { id: 'm3', name: '100m Rifle', discipline: 'rifle', shots: 40, format: '5×6', scores: 12, maxScores: 12 }
    ],
    squads: [
      { id: 's1', number: 1, shooters: 4, maxShooters: 5, status: 'completed' },
      { id: 's2', number: 2, shooters: 3, maxShooters: 5, status: 'completed' },
      { id: 's3', number: 3, shooters: 5, maxShooters: 5, status: 'shooting' },
      { id: 's4', number: 4, shooters: 0, maxShooters: 5, status: 'waiting' },
      { id: 's5', number: 5, shooters: 0, maxShooters: 5, status: 'waiting' }
    ],
    personnel: [
      { id: 'p1', role: 'Match Director', name: 'Tommi W.', email: 'tommi@example.com', status: 'confirmed' },
      { id: 'p2', role: 'Range Officer', name: null, email: null, status: 'vacant' },
      { id: 'p3', role: 'Quarter Master', name: null, email: null, status: 'vacant' }
    ],
    waitlist: []
  },
  {
    id: 'training-001',
    type: 'sra-training',
    name: 'SRA Training',
    date: '2026-06-22',
    time: '18:00',
    endTime: '20:00',
    location: 'Hirvihaara',
    locationDetail: 'SRA-rata',
    status: 'upcoming',
    description: 'SRA-harjoitus pistoolilla ja kiväärillä',
    stats: {
      shooters: 4,
      maxShooters: 12,
      scoresSubmitted: 0,
      dnfs: 0,
      activeSquads: 0,
      totalSquads: 3
    },
    matches: [
      { id: 'm1', name: 'SRA Pistol', discipline: 'sra', shots: null, format: 'stage', scores: 0, maxScores: 12 },
      { id: 'm2', name: 'SRA Rifle', discipline: 'sra', shots: null, format: 'stage', scores: 0, maxScores: 12 }
    ],
    squads: [
      { id: 's1', number: 1, shooters: 4, maxShooters: 4, status: 'filled' },
      { id: 's2', number: 2, shooters: 0, maxShooters: 4, status: 'open' },
      { id: 's3', number: 3, shooters: 0, maxShooters: 4, status: 'open' }
    ],
    personnel: [
      { id: 'p1', role: 'Trainer', name: 'Matti M.', email: 'matti@example.com', status: 'confirmed' }
    ],
    waitlist: [
      { id: 'w1', name: 'Kimmo S.', email: 'kimmo@example.com', registeredAt: '2026-06-10' }
    ]
  },
  {
    id: 'cup-002',
    type: 'kupittaa-cup',
    name: 'Kupittaa CUP',
    date: '2026-06-29',
    time: '09:00',
    endTime: '14:00',
    location: 'Kupittaa',
    locationDetail: 'Rata 1-3',
    status: 'draft',
    description: 'Kesäkuun viimeinen cup',
    stats: {
      shooters: 0,
      maxShooters: 15,
      scoresSubmitted: 0,
      dnfs: 0,
      activeSquads: 0,
      totalSquads: 3
    },
    matches: [
      { id: 'm1', name: '25m Pistol', discipline: 'pistol', shots: 50, format: '5×6', scores: 0, maxScores: 15 },
      { id: 'm2', name: '50m Rifle', discipline: 'rifle', shots: 40, format: '5×6', scores: 0, maxScores: 15 }
    ],
    squads: [
      { id: 's1', number: 1, shooters: 0, maxShooters: 5, status: 'waiting' },
      { id: 's2', number: 2, shooters: 0, maxShooters: 5, status: 'waiting' },
      { id: 's3', number: 3, shooters: 0, maxShooters: 5, status: 'waiting' }
    ],
    personnel: [],
    waitlist: []
  }
]

export const trainingTypes = [
  {
    id: 'kupittaa-cup',
    name: 'Kupittaa CUP',
    icon: '🎯',
    description: '3 matches: 25m pistol, 50m rifle, 100m rifle',
    defaultMatches: [
      { name: '25m Pistol', discipline: 'pistol', shots: 50, format: '5×6' },
      { name: '50m Rifle', discipline: 'rifle', shots: 40, format: '5×6' },
      { name: '100m Rifle', discipline: 'rifle', shots: 40, format: '5×6' }
    ],
    defaultSquads: 5,
    maxPerSquad: 5,
    defaultLocation: 'Kupittaa'
  },
  {
    id: 'sra-training',
    name: 'SRA Training',
    icon: '🎯',
    description: 'SRA practice: pistol and rifle stages',
    defaultMatches: [
      { name: 'SRA Pistol', discipline: 'sra', shots: null, format: 'stage' },
      { name: 'SRA Rifle', discipline: 'sra', shots: null, format: 'stage' }
    ],
    defaultSquads: 3,
    maxPerSquad: 4,
    defaultLocation: 'Hirvihaara'
  }
]

export function getEventById(id) {
  return mockEvents.find(e => e.id === id)
}

export function getUpcomingEvents() {
  return mockEvents.filter(e => e.status !== 'archived')
}

export function formatDate(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' })
}

export function formatDateRelative(dateStr) {
  const date = new Date(dateStr)
  const today = new Date()
  const diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Tänään'
  if (diffDays === 1) return 'Huomenna'
  if (diffDays < 7) return `${diffDays} päivää`
  if (diffDays < 14) return 'Viikon päästä'
  return formatDate(dateStr)
}

export function getStatusColor(status) {
  switch (status) {
    case 'live': return 'red'
    case 'upcoming': return 'yellow'
    case 'draft': return 'gray'
    case 'setup': return 'blue'
    case 'open': return 'green'
    case 'closed': return 'gray'
    default: return 'gray'
  }
}

export function getStatusLabel(status) {
  switch (status) {
    case 'live': return '🔴 LIVE'
    case 'upcoming': return '🟡 TULOSSA'
    case 'draft': return '⚪ LUONNOS'
    case 'setup': return '🔵 VALMISTELU'
    case 'open': return '🟢 AUKI'
    case 'closed': return '⚪ PÄÄTTYNYT'
    default: return status
  }
}

import { AppHeader } from './shared'

const features = [
  {
    href: '#/scoring',
    title: 'Tulosten syöttö',
    description: 'Syötä kilpailutulokset puhelimella',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    color: 'blue',
  },
  {
    href: '#/register',
    title: 'Ilmoittautuminen',
    description: 'Ilmoittaudu Kupittaa CUP -kilpailuun',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    ),
    color: 'green',
  },
  {
    href: '#/manage',
    title: 'Hallinta',
    description: 'Squadien ja ilmoittautumisten hallinta',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    color: 'purple',
  },
  {
    href: '#/report',
    title: 'Raportti',
    description: 'Kilpailuraportit ja tilastot',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    color: 'amber',
  },
  {
    href: '#/summary',
    title: 'Yhteenveto',
    description: 'Kilpailujen yhteenvetoraportti',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
    color: 'teal',
  },
]

const colorMap = {
  blue: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-200', hover: 'active:bg-blue-100' },
  green: { bg: 'bg-green-50', icon: 'text-green-600', border: 'border-green-200', hover: 'active:bg-green-100' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', border: 'border-purple-200', hover: 'active:bg-purple-100' },
  amber: { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-200', hover: 'active:bg-amber-100' },
  teal: { bg: 'bg-teal-50', icon: 'text-teal-600', border: 'border-teal-200', hover: 'active:bg-teal-100' },
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Kupittaa Cup" subtitle="TurRes reservilaisammunta" />

      <div className="p-4 space-y-3">
        {features.map(f => {
          const c = colorMap[f.color]
          return (
            <a
              key={f.href}
              href={f.href}
              className={`flex items-center gap-4 p-4 rounded-xl border ${c.border} ${c.bg} ${c.hover} transition-colors`}
            >
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${c.icon} bg-white border ${c.border}`}>
                {f.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800 text-lg">{f.title}</div>
                <div className="text-sm text-gray-500 mt-0.5">{f.description}</div>
              </div>
              <svg className="w-5 h-5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          )
        })}
      </div>
    </div>
  )
}

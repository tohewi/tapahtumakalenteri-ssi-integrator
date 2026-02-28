import { useState } from 'react'

export default function RosterView() {
  // Temporary placeholder data until backend module is implemented
  const [instructors] = useState([
    {
      id: 1,
      name: 'Matti Virtanen',
      email: 'matti.virtanen@gmail.com',
      joined: '2025-01-15',
      status: 'active',
      roles: ['Staff'],
      disciplines: ['SRA'],
    },
    {
      id: 2,
      name: 'Kalle Huttunen',
      email: 'kalle.h@outlook.com',
      joined: '2025-02-01',
      status: 'active',
      roles: ['Staff', 'Equipment'],
      disciplines: ['KC', 'SRA'],
    },
    {
      id: 3,
      name: 'Antti L',
      email: 'antti.l@example.com',
      joined: '2025-02-28',
      status: 'pending',
      roles: [],
      disciplines: ['KC'],
    }
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Instructor Roster</h1>
          <p className="text-sm text-gray-400">Manage the pool of qualified instructors.</p>
        </div>
        <button className="border border-sky-300 text-sky-600 px-4 py-2 rounded-md text-sm hover:bg-sky-50 font-medium">
          Invite instructor
        </button>
      </div>

      <div className="bg-amber-50 border border-dashed border-amber-300 rounded-lg p-6 text-center text-amber-700 text-sm mb-8">
        This is a UI placeholder. The instructor management backend is not yet implemented.
      </div>

      {/* Pending approvals */}
      <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-amber-800 mb-3">Pending Registrations (1)</h3>
        <div className="space-y-2">
          {instructors.filter(i => i.status === 'pending').map(inst => (
            <div key={inst.id} className="bg-white rounded-lg border border-amber-100 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-amber-200 rounded-full flex items-center justify-center text-amber-800 text-xs font-bold">
                  {inst.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{inst.name}</div>
                  <div className="text-xs text-gray-500">{inst.email} · Applied {inst.joined}</div>
                  <div className="text-xs text-gray-500 mt-1 flex gap-2 items-center">
                    <span>Disciplines:</span>
                    {inst.disciplines.map(d => (
                      <span key={d} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">{d}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button className="text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 font-medium">Approve</button>
                <button className="text-xs border border-red-300 text-red-600 px-3 py-1.5 rounded hover:bg-red-50 font-medium">Reject</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <select className="text-sm border rounded-md px-3 py-1.5 bg-white text-gray-700 focus:ring-sky-200">
          <option>All Disciplines</option>
          <option>Kupittaa Cup</option>
          <option>SRA</option>
        </select>
        <select className="text-sm border rounded-md px-3 py-1.5 bg-white text-gray-700 focus:ring-sky-200">
          <option>All Statuses</option>
          <option>Active</option>
          <option>Inactive</option>
        </select>
        <input 
          type="text" 
          placeholder="Search by name or email..." 
          className="text-sm border rounded-md px-3 py-1.5 w-full sm:w-64 bg-white focus:ring-sky-200"
        />
        <span className="text-xs text-gray-400 sm:ml-auto">{instructors.filter(i => i.status === 'active').length} active instructors</span>
      </div>

      {/* Roster table */}
      <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider border-b bg-gray-50">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Disciplines</th>
              <th className="px-4 py-3 font-medium">Roles</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {instructors.filter(i => i.status === 'active').map(inst => (
              <tr key={inst.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-sky-100 rounded-full flex items-center justify-center text-sky-700 text-[10px] font-bold">
                      {inst.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <span className="font-medium text-gray-900">{inst.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{inst.email}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {inst.disciplines.map(d => (
                      <span key={d} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">{d}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {inst.roles.join(', ') || '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-sky-600 hover:text-sky-800 text-xs font-medium">Manage</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
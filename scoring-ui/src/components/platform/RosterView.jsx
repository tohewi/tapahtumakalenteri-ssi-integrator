// ============================================================
// RosterView — Event staffing placeholder
//
// Future: Instructors sign up for events that need staff.
// (SRA staffing functionality will be migrated here)
//
// Member management has been consolidated to MembersPage.
// ============================================================

export default function RosterView() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Event Staffing</h1>
      <p className="text-sm text-gray-500 mb-6">
        Sign up as staff for upcoming events.
      </p>

      <div className="bg-white rounded-lg border shadow-sm p-8 text-center">
        <div className="text-4xl mb-4">&#x1F4CB;</div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Coming Soon</h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          This page will show upcoming events that need instructors and range officers.
          You will be able to sign up for events, view your assignments, and manage your availability.
        </p>
        <div className="mt-6 text-xs text-gray-400">
          Member management is available under Admin &rarr; Members.
        </div>
      </div>
    </div>
  )
}

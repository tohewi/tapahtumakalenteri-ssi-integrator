// ============================================================
// DashboardPage — Post-login view showing tenant list
//
// Matches the UI prototype's "My Tenants" view with tenant cards
// showing subscription status, stats summary, and quick actions.
// ============================================================

// Subscription status badge colors
const STATUS_STYLES = {
  trial: 'bg-amber-100 text-amber-700',
  active: 'bg-green-100 text-green-700',
  past_due: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('fi-FI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function daysUntil(ts) {
  if (!ts) return null
  const diff = ts - Date.now()
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
}

function SubscriptionBadge({ subscription }) {
  const status = subscription?.status || 'trial'
  const plan = subscription?.plan || 'free_trial'
  const style = STATUS_STYLES[status] || STATUS_STYLES.trial

  const labels = {
    trial: 'Trial',
    active: 'Active',
    past_due: 'Past Due',
    cancelled: 'Cancelled',
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {labels[status] || status}
    </span>
  )
}

function TenantCard({ tenant, onSelect }) {
  const sub = tenant.subscription || {}
  const isTrial = sub.status === 'trial'
  const isCancelled = sub.status === 'cancelled'
  const trialDays = isTrial ? daysUntil(sub.trialEndsAt) : null
  const disciplineCount = tenant.disciplines?.length || 0

  return (
    <div
      onClick={() => onSelect?.(tenant.id)}
      className={`bg-white rounded-lg border p-5 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer ${
        isCancelled ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-sky-100 rounded-lg flex items-center justify-center text-sky-700 text-lg font-bold">
            {tenant.name?.slice(0, 2).toUpperCase() || '??'}
          </div>
          <div>
            <div className="font-semibold text-lg">{tenant.name}</div>
            <div className="text-sm text-gray-500">
              {disciplineCount} discipline{disciplineCount !== 1 ? 's' : ''}
              {' · Created '}
              {formatDate(tenant.createdAt)}
            </div>
          </div>
        </div>
        <div className="text-right">
          <SubscriptionBadge subscription={sub} />
          {isTrial && trialDays !== null && (
            <div className="text-xs text-amber-600 mt-1">
              {trialDays} day{trialDays !== 1 ? 's' : ''} left
            </div>
          )}
          {!isTrial && !isCancelled && sub.currentPeriodEnd && (
            <div className="text-xs text-gray-400 mt-1">
              Renews {formatDate(sub.currentPeriodEnd)}
            </div>
          )}
        </div>
      </div>

      {/* Quick stats row — placeholder until real data is available */}
      <div className="mt-3 pt-3 border-t flex gap-6 text-xs text-gray-500">
        <span>📋 0 templates</span>
        <span>📅 0 events</span>
        <span>👥 0 instructors</span>
      </div>
    </div>
  )
}

export default function DashboardPage({ account, tenants, onLogout, onCreateTenant, onSelectTenant, onAccountSettings }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <div className="text-lg font-bold text-sky-700">Match Management</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={onAccountSettings}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                title="Account settings"
              >
                <div className="w-8 h-8 bg-sky-100 rounded-full flex items-center justify-center text-sky-700 text-sm font-semibold">
                  {account?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                </div>
                <span className="text-sm text-gray-600 hidden sm:inline">{account?.email}</span>
              </button>
              <button
                onClick={onLogout}
                className="text-xs text-gray-400 hover:text-gray-600 ml-2"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Tenants</h1>
            <p className="text-sm text-gray-500 mt-1">
              Signed in as <strong>{account?.email}</strong>
            </p>
          </div>
          <button
            onClick={onCreateTenant}
            className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm hover:bg-sky-700 transition-colors"
          >
            + New Tenant
          </button>
        </div>

        {tenants.length === 0 ? (
          <div className="bg-white rounded-lg border p-12 text-center">
            <div className="text-4xl mb-4">🏢</div>
            <h2 className="text-lg font-semibold text-gray-700 mb-2">No tenants yet</h2>
            <p className="text-sm text-gray-500 mb-6">
              Create your first tenant to get started with match management.
            </p>
            <button
              onClick={onCreateTenant}
              className="bg-sky-600 text-white px-6 py-2.5 rounded-md font-semibold hover:bg-sky-700 transition-colors"
            >
              Create First Tenant
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {tenants.map(tenant => (
              <TenantCard key={tenant.id} tenant={tenant} onSelect={onSelectTenant} />
            ))}
          </div>
        )}

        {/* Quick actions */}
        {tenants.length > 0 && (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border p-4 text-left opacity-50 cursor-not-allowed">
              <div className="text-sky-600 font-semibold">+ New Template</div>
              <div className="text-sm text-gray-500 mt-1">Import from SSI seed event</div>
              <div className="text-xs text-gray-400 mt-2 italic">Coming soon</div>
            </div>
            <div className="bg-white rounded-lg border p-4 text-left opacity-50 cursor-not-allowed">
              <div className="text-sky-600 font-semibold">+ Schedule Events</div>
              <div className="text-sm text-gray-500 mt-1">Batch create from template</div>
              <div className="text-xs text-gray-400 mt-2 italic">Coming soon</div>
            </div>
            <div className="bg-white rounded-lg border p-4 text-left opacity-50 cursor-not-allowed">
              <div className="text-sky-600 font-semibold">Instructor Roster</div>
              <div className="text-sm text-gray-500 mt-1">Manage instructors</div>
              <div className="text-xs text-gray-400 mt-2 italic">Coming soon</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

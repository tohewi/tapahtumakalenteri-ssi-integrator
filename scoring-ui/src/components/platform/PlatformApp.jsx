// ============================================================
// PlatformApp — Main shell for the Match Management Platform
//
// Layout (matching match-management-ui-prototype.html):
//   - Top bar: app name + tenant selector + user avatar
//   - Sidebar: Management (Dashboard, Templates, Schedule),
//              Instructor Roster (Roster, Join, My Profile),
//              Admin (My Tenants, Billing, Settings)
//   - Main content area: view based on sidebar selection
//
// Auth flow (welcome, sign-in) is full-page (no sidebar).
// Once authenticated and tenant selected, shows sidebar layout.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import {
  platformRegister,
  platformLogin,
  platformLogout,
  platformStatus,
  createTenant,
} from '../../platform-api.js'

// ---- Sub-views (auth flow — full page) ----
import WelcomePage from './WelcomePage.jsx'
import SignInPage from './SignInPage.jsx'
import TenantCreatePage from './TenantCreatePage.jsx'

// ---- Sub-views (sidebar content) ----
import TenantDetailPage from './TenantDetailPage.jsx'
import AccountSettingsPage from './AccountSettingsPage.jsx'
import TemplateEditorPage from './TemplateEditorPage.jsx'
import SchedulePage from './SchedulePage.jsx'

// ---- Navigation sections matching the mockup ----
const NAV_SECTIONS = [
  {
    label: 'Management',
    items: [
      { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
      { id: 'templates', icon: '📋', label: 'Templates' },
      { id: 'schedule', icon: '📅', label: 'Schedule' },
    ],
  },
  {
    label: 'Instructor Roster',
    items: [
      { id: 'roster', icon: '👥', label: 'Roster' },
      { id: 'join', icon: '🙋', label: 'Join' },
      { id: 'my-profile', icon: '👤', label: 'My Profile' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { id: 'my-tenants', icon: '📊', label: 'My Tenants' },
      { id: 'settings', icon: '⚙', label: 'Settings' },
    ],
  },
]

// ---- App states ----
const AUTH = {
  LOADING: 'loading',
  WELCOME: 'welcome',
  SIGN_IN: 'sign_in',
  CREATE_TENANT: 'create_tenant',
  APP: 'app', // authenticated, sidebar layout
}

// ---- Placeholder views for unimplemented sections ----
function PlaceholderView({ title, description }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
      <p className="text-sm text-gray-400 mb-6">{description}</p>
      <div className="bg-amber-50 border border-dashed border-amber-300 rounded-lg p-6 text-center text-amber-700 text-sm">
        This view is coming soon. The structure is defined in the UI prototype.
      </div>
    </div>
  )
}

// ---- Dashboard placeholder (will be replaced with real dashboard) ----
function DashboardView({ tenantId }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border p-4"><div className="text-sm text-gray-500">Upcoming Events</div><div className="text-3xl font-bold text-sky-700 mt-1">—</div><div className="text-xs text-gray-400 mt-1">Next 30 days</div></div>
        <div className="bg-white rounded-lg border p-4"><div className="text-sm text-gray-500">Staffing Gaps</div><div className="text-3xl font-bold text-amber-600 mt-1">—</div><div className="text-xs text-gray-400 mt-1">Events need instructors</div></div>
        <div className="bg-white rounded-lg border p-4"><div className="text-sm text-gray-500">Active Templates</div><div className="text-3xl font-bold text-gray-700 mt-1">—</div><div className="text-xs text-gray-400 mt-1">Across disciplines</div></div>
        <div className="bg-white rounded-lg border p-4"><div className="text-sm text-gray-500">Instructors</div><div className="text-3xl font-bold text-gray-700 mt-1">—</div><div className="text-xs text-gray-400 mt-1">Active roster</div></div>
      </div>
      <div className="text-sm text-gray-400">Dashboard will show upcoming events with staffing status, quick actions, and recent activity.</div>
    </div>
  )
}

// ---- Sidebar component ----
function Sidebar({ activeView, onNavigate }) {
  return (
    <nav className="w-56 bg-white border-r p-3 flex-shrink-0 hidden md:block">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label}>
          <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2 px-3 mt-4 first:mt-0">
            {section.label}
          </div>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <div
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`cursor-pointer rounded-md px-3 py-2 text-sm transition-colors ${
                  activeView === item.id
                    ? 'bg-sky-500 text-white'
                    : 'text-gray-700 hover:bg-sky-50'
                }`}
              >
                {item.icon} {item.label}
              </div>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

// ---- Top bar component ----
function TopBar({ account, tenants, selectedTenantId, onChangeTenant, onLogout }) {
  const initials = account?.name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || '??'

  return (
    <header className="bg-white border-b shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-3">
          <div className="text-lg font-bold text-sky-700">Match Management</div>
        </div>
        <div className="flex items-center gap-4">
          {/* Tenant selector */}
          {tenants.length > 1 && (
            <select
              value={selectedTenantId || ''}
              onChange={e => onChangeTenant(e.target.value)}
              className="text-sm border rounded-md px-3 py-1.5"
            >
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          {tenants.length === 1 && (
            <span className="text-sm text-gray-600">{tenants[0].name}</span>
          )}
          {/* User avatar */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-sky-100 rounded-full flex items-center justify-center text-sky-700 text-sm font-semibold">
              {initials}
            </div>
            <span className="text-sm text-gray-600 hidden sm:inline">{account?.email}</span>
            <button onClick={onLogout} className="text-xs text-gray-400 hover:text-gray-600 ml-2">Sign out</button>
          </div>
        </div>
      </div>
    </header>
  )
}

// ---- Mobile nav (bottom bar for small screens) ----
function MobileNav({ activeView, onNavigate }) {
  const mainItems = [
    { id: 'dashboard', icon: '🏠', label: 'Home' },
    { id: 'templates', icon: '📋', label: 'Templates' },
    { id: 'schedule', icon: '📅', label: 'Schedule' },
    { id: 'roster', icon: '👥', label: 'Roster' },
    { id: 'settings', icon: '⚙', label: 'More' },
  ]
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-2 z-50">
      {mainItems.map(item => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 text-xs ${
            activeView === item.id ? 'text-sky-600 font-semibold' : 'text-gray-400'
          }`}
        >
          <span className="text-lg">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  )
}

// ---- Main App ----

export default function PlatformApp() {
  const [authState, setAuthState] = useState(AUTH.LOADING)
  const [account, setAccount] = useState(null)
  const [tenants, setTenants] = useState([])
  const [error, setError] = useState(null)
  const [selectedTenantId, setSelectedTenantId] = useState(null)
  const [activeView, setActiveView] = useState('dashboard')
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)

  // Check session on mount
  useEffect(() => {
    checkSession()
  }, [])

  async function checkSession() {
    try {
      const data = await platformStatus()
      if (data.authenticated) {
        setAccount(data.account)
        setTenants(data.tenants || [])
        // Auto-select first tenant
        if (data.tenants?.length > 0) {
          setSelectedTenantId(data.tenants[0].id)
        }
        setAuthState(AUTH.APP)
      } else {
        setAuthState(AUTH.WELCOME)
      }
    } catch {
      setAuthState(AUTH.WELCOME)
    }
  }

  // ---- Auth actions ----

  const handleRegister = useCallback(async (formData) => {
    setError(null)
    try {
      const data = await platformRegister(formData)
      setAccount(data.account)
      setTenants(data.tenant ? [data.tenant] : [])
      if (data.tenant) setSelectedTenantId(data.tenant.id)
      setAuthState(AUTH.APP)
    } catch (err) {
      setError(err.details ? err.details.join('. ') : err.message)
      throw err
    }
  }, [])

  const handleLogin = useCallback(async ({ email, password }) => {
    setError(null)
    try {
      const data = await platformLogin({ email, password })
      setAccount(data.account)
      setTenants(data.tenants || [])
      if (data.tenants?.length > 0) setSelectedTenantId(data.tenants[0].id)
      setAuthState(AUTH.APP)
    } catch (err) {
      setError(err.message)
      throw err
    }
  }, [])

  const handleLogout = useCallback(async () => {
    try { await platformLogout() } catch { /* ignore */ }
    setAccount(null)
    setTenants([])
    setSelectedTenantId(null)
    setAuthState(AUTH.WELCOME)
  }, [])

  const handleCreateTenant = useCallback(async ({ name }) => {
    setError(null)
    try {
      const data = await createTenant({ name })
      setTenants(prev => [...prev, data.tenant])
      setSelectedTenantId(data.tenant.id)
      setAuthState(AUTH.APP)
    } catch (err) {
      setError(err.message)
      throw err
    }
  }, [])

  const handleAccountUpdated = useCallback((updatedAccount) => {
    setAccount(updatedAccount)
  }, [])

  // ---- Navigate within sidebar ----
  function navigate(viewId, extra) {
    setActiveView(viewId)
    if (extra?.templateId) setSelectedTemplateId(extra.templateId)
  }

  // ---- Render: Auth flow (full page, no sidebar) ----

  if (authState === AUTH.LOADING) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  if (authState === AUTH.WELCOME) {
    return <WelcomePage error={error} onRegister={handleRegister} onSwitchToSignIn={() => { setError(null); setAuthState(AUTH.SIGN_IN) }} />
  }

  if (authState === AUTH.SIGN_IN) {
    return <SignInPage error={error} onLogin={handleLogin} onSwitchToSignUp={() => { setError(null); setAuthState(AUTH.WELCOME) }} />
  }

  if (authState === AUTH.CREATE_TENANT) {
    return <TenantCreatePage error={error} onCreateTenant={handleCreateTenant} onCancel={() => { setError(null); setAuthState(AUTH.APP) }} />
  }

  // ---- Render: App shell with sidebar ----

  // Render the active content view
  function renderContent() {
    if (!selectedTenantId) {
      return <PlaceholderView title="No Tenant Selected" description="Create or select a tenant to get started." />
    }

    switch (activeView) {
      case 'dashboard':
        return <DashboardView tenantId={selectedTenantId} />

      case 'templates':
        if (selectedTemplateId) {
          return (
            <TemplateEditorPage
              tenantId={selectedTenantId}
              templateId={selectedTemplateId}
              onBack={() => { setSelectedTemplateId(null) }}
            />
          )
        }
        // Re-use TenantDetailPage's template section for now — will be replaced with card grid
        return (
          <TenantDetailPage
            tenantId={selectedTenantId}
            account={account}
            onBack={() => setActiveView('dashboard')}
            onLogout={handleLogout}
            onEditTemplate={(templateId) => { setSelectedTemplateId(templateId) }}
            onSchedule={() => setActiveView('schedule')}
            sectionsFilter="templates"
          />
        )

      case 'schedule':
        return <SchedulePage tenantId={selectedTenantId} onBack={() => setActiveView('dashboard')} />

      case 'roster':
        return <PlaceholderView title="Instructor Roster" description="Manage the pool of qualified instructors. Approve registrations, assign disciplines and roles." />

      case 'join':
        return <PlaceholderView title="Join as Instructor" description="Register to join the instructor roster for this organization." />

      case 'my-profile':
        return (
          <AccountSettingsPage
            account={account}
            onAccountUpdated={handleAccountUpdated}
            onBack={() => setActiveView('dashboard')}
            onLogout={handleLogout}
          />
        )

      case 'my-tenants':
        return (
          <TenantDetailPage
            tenantId={selectedTenantId}
            account={account}
            onBack={() => setActiveView('dashboard')}
            onLogout={handleLogout}
            onEditTemplate={(templateId) => { setSelectedTemplateId(templateId); setActiveView('templates') }}
            onSchedule={() => setActiveView('schedule')}
            sectionsFilter="tenant-info"
          />
        )

      case 'settings':
        return (
          <TenantDetailPage
            tenantId={selectedTenantId}
            account={account}
            onBack={() => setActiveView('dashboard')}
            onLogout={handleLogout}
            onEditTemplate={(templateId) => { setSelectedTemplateId(templateId); setActiveView('templates') }}
            onSchedule={() => setActiveView('schedule')}
            sectionsFilter="settings"
          />
        )

      default:
        return <PlaceholderView title="Not Found" description={`View "${activeView}" does not exist.`} />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar
        account={account}
        tenants={tenants}
        selectedTenantId={selectedTenantId}
        onChangeTenant={(id) => { setSelectedTenantId(id); setActiveView('dashboard') }}
        onLogout={handleLogout}
      />
      <div className="max-w-7xl mx-auto flex min-h-[calc(100vh-3.5rem)]">
        <Sidebar activeView={activeView} onNavigate={(id) => { setSelectedTemplateId(null); setActiveView(id) }} />
        <main className="flex-1 p-6 overflow-auto pb-20 md:pb-6">
          {renderContent()}
        </main>
      </div>
      <MobileNav activeView={activeView} onNavigate={(id) => { setSelectedTemplateId(null); setActiveView(id) }} />
    </div>
  )
}

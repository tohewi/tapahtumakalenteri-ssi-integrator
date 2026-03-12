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
  getTenantLogoUrl,
} from '../../platform-api.js'
import { PlatformI18nProvider, usePlatformT } from '../../platform-i18n.jsx'

import DashboardView from './DashboardView.jsx'
import RosterView from './RosterView.jsx'
import WelcomePage from './WelcomePage.jsx'
import SignInPage from './SignInPage.jsx'
import TenantCreatePage from './TenantCreatePage.jsx'
import JoinInvitePage from './JoinInvitePage.jsx'
import MfaChallengePage from './MfaChallengePage.jsx'
import ForgotPasswordPage from './ForgotPasswordPage.jsx'
import ResetPasswordPage from './ResetPasswordPage.jsx'

// ---- Sub-views (sidebar content) ----
import TenantDetailPage from './TenantDetailPage.jsx'
import AccountSettingsPage from './AccountSettingsPage.jsx'
import MembersPage from './MembersPage.jsx'
import TemplateEditorPage from './TemplateEditorPage.jsx'
import SchedulePage from './SchedulePage.jsx'

// ---- Navigation sections matching the mockup ----
// Labels use i18n keys, resolved at render time
const NAV_SECTIONS = [
  {
    // Dashboard is standalone at the top — always visible, no section header
    items: [
      { id: 'dashboard', icon: '🏠', labelKey: 'navDashboard' },
    ],
  },
  {
    labelKey: 'sectionEventManagement',
    items: [
      { id: 'templates', icon: '📋', labelKey: 'navTemplates' },
      { id: 'schedule', icon: '📅', labelKey: 'navSchedule' },
    ],
  },
  {
    labelKey: 'sectionInstructorRoster',
    items: [
      { id: 'roster', icon: '👥', labelKey: 'navRoster' },
      { id: 'join', icon: '🙋', labelKey: 'navJoin' },
      { id: 'my-profile', icon: '👤', labelKey: 'navMyProfile' },
    ],
  },
  {
    labelKey: 'sectionAdmin',
    items: [
      { id: 'my-tenants', icon: '📊', labelKey: 'navTenant' },
      { id: 'members', icon: '🤝', labelKey: 'navMembers' },
      { id: 'settings', icon: '⚙', labelKey: 'navSettings' },
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
  JOIN_INVITE: 'join_invite', // accepting an invite
  MFA_CHALLENGE: 'mfa_challenge', // MFA verification after login
  FORGOT_PASSWORD: 'forgot_password',
  RESET_PASSWORD: 'reset_password', // from email link
}

// ---- Placeholder views for unimplemented sections ----
function PlaceholderView({ title, description }) {
  const { t } = usePlatformT()
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
      <p className="text-sm text-gray-400 mb-6">{description}</p>
      <div className="bg-amber-50 border border-dashed border-amber-300 rounded-lg p-6 text-center text-amber-700 text-sm">
        {t('comingSoon')}
      </div>
    </div>
  )
}

// ---- Sidebar component ----
function Sidebar({ activeView, onNavigate }) {
  const { t } = usePlatformT()
  return (
    <nav className="w-56 bg-white border-r p-3 flex-shrink-0 hidden md:block">
      {NAV_SECTIONS.map((section, idx) => (
        <div key={section.labelKey || `section-${idx}`}>
          {section.labelKey && (
            <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2 px-3 mt-4 first:mt-0">
              {t(section.labelKey)}
            </div>
          )}
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
                {item.icon} {t(item.labelKey)}
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
  const { t, lang, setLanguage } = usePlatformT()
  const initials = account?.name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || '??'

  return (
    <header className="bg-white border-b shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-3">
          <div className="text-lg font-bold text-sky-700">{t('appName')}</div>
        </div>
        <div className="flex items-center gap-4">
          {/* Language selector */}
          <button
            onClick={() => setLanguage(lang === 'fi' ? 'en' : 'fi')}
            className="text-xs text-gray-400 hover:text-gray-600 font-medium px-1.5 py-0.5 border rounded"
            title={t('language')}
          >
            {lang === 'fi' ? 'EN' : 'FI'}
          </button>
          {/* Tenant selector */}
          {tenants.length > 1 && (
            <select
              value={selectedTenantId || ''}
              onChange={e => onChangeTenant(e.target.value)}
              className="text-sm border rounded-md px-3 py-1.5"
            >
              {tenants.map(tn => (
                <option key={tn.id} value={tn.id}>{tn.name}</option>
              ))}
            </select>
          )}
          {tenants.length === 1 && (
            <span className="text-sm text-gray-600 flex items-center gap-2">
              {tenants[0].hasLogo && (
                <img src={getTenantLogoUrl(tenants[0].id)} alt="" className="w-6 h-6 rounded object-contain" />
              )}
              {tenants[0].name}
            </span>
          )}
          {/* User avatar */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-sky-100 rounded-full flex items-center justify-center text-sky-700 text-sm font-semibold">
              {initials}
            </div>
            <span className="text-sm text-gray-600 hidden sm:inline">{account?.email}</span>
            <button onClick={onLogout} className="text-xs text-gray-400 hover:text-gray-600 ml-2">{t('signOut')}</button>
          </div>
        </div>
      </div>
    </header>
  )
}

// ---- Mobile nav (bottom bar for small screens) ----
function MobileNav({ activeView, onNavigate }) {
  const { t } = usePlatformT()
  const mainItems = [
    { id: 'dashboard', icon: '🏠', labelKey: 'navHome' },
    { id: 'templates', icon: '📋', labelKey: 'navTemplates' },
    { id: 'schedule', icon: '📅', labelKey: 'navSchedule' },
    { id: 'roster', icon: '👥', labelKey: 'navRoster' },
    { id: 'settings', icon: '⚙', labelKey: 'navMore' },
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
          {t(item.labelKey)}
        </button>
      ))}
    </nav>
  )
}

// ---- Main App ----

export default function PlatformApp({ route }) {
  return (
    <PlatformI18nProvider>
      <PlatformAppInner route={route} />
    </PlatformI18nProvider>
  )
}

function PlatformAppInner({ route }) {
  const { t } = usePlatformT()
  const [authState, setAuthState] = useState(AUTH.LOADING)
  const [account, setAccount] = useState(null)
  const [tenants, setTenants] = useState([])
  const [error, setError] = useState(null)
  const [selectedTenantId, setSelectedTenantId] = useState(null)
  const [activeView, setActiveView] = useState('dashboard')
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [inviteToken, setInviteToken] = useState(null)
  const [resetToken, setResetToken] = useState(null)

  // Check session and route on mount
  useEffect(() => {
    // Check if this is an invite link: #/platform/invite/:token
    if (route && route.startsWith('#/platform/invite/')) {
      const token = route.split('/').pop()
      if (token) {
        setInviteToken(token)
        setAuthState(AUTH.JOIN_INVITE)
        return // skip session check for invite flow (it handles its own auth state)
      }
    }

    // Check if this is a password reset link: #/platform/reset-password/:token
    if (route && route.startsWith('#/platform/reset-password/')) {
      const token = route.split('/').pop()
      if (token) {
        setResetToken(token)
        setAuthState(AUTH.RESET_PASSWORD)
        return
      }
    }

    checkSession()
  }, [route])

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
      if (data.mfaRequired) {
        // MFA is enabled — show challenge screen
        setAuthState(AUTH.MFA_CHALLENGE)
        return
      }
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
  const [focusEventId, setFocusEventId] = useState(null)
  function navigate(viewId, extra) {
    setActiveView(viewId)
    if (extra?.templateId) setSelectedTemplateId(extra.templateId)
    setFocusEventId(extra?.focusEventId || null)
  }

  // ---- Render: Auth flow (full page, no sidebar) ----

  if (authState === AUTH.LOADING) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">{t('loading')}</div>
      </div>
    )
  }

  if (authState === AUTH.WELCOME) {
    return <WelcomePage error={error} onRegister={handleRegister} onSwitchToSignIn={() => { setError(null); setAuthState(AUTH.SIGN_IN) }} />
  }

  if (authState === AUTH.SIGN_IN) {
    return (
      <SignInPage
        error={error}
        onLogin={handleLogin}
        onSwitchToSignUp={() => { setError(null); setAuthState(AUTH.WELCOME) }}
        onForgotPassword={() => { setError(null); setAuthState(AUTH.FORGOT_PASSWORD) }}
      />
    )
  }

  if (authState === AUTH.FORGOT_PASSWORD) {
    return <ForgotPasswordPage onBack={() => { setAuthState(AUTH.SIGN_IN) }} />
  }

  if (authState === AUTH.RESET_PASSWORD) {
    return (
      <ResetPasswordPage
        token={resetToken}
        onComplete={() => {
          window.location.hash = '#/platform'
          setResetToken(null)
          setAuthState(AUTH.SIGN_IN)
        }}
        onCancel={() => {
          window.location.hash = '#/platform'
          setResetToken(null)
          setAuthState(AUTH.SIGN_IN)
        }}
      />
    )
  }

  if (authState === AUTH.CREATE_TENANT) {
    return <TenantCreatePage error={error} onCreateTenant={handleCreateTenant} onCancel={() => { setError(null); setAuthState(AUTH.APP) }} />
  }

  if (authState === AUTH.MFA_CHALLENGE) {
    return (
      <MfaChallengePage
        onComplete={({ account, tenants }) => {
          setAccount(account)
          setTenants(tenants || [])
          if (tenants?.length > 0) setSelectedTenantId(tenants[0].id)
          setAuthState(AUTH.APP)
        }}
        onCancel={() => {
          handleLogout()
        }}
      />
    )
  }

  if (authState === AUTH.JOIN_INVITE) {
    return (
      <JoinInvitePage
        token={inviteToken}
        onComplete={({ account, tenants, selectedTenantId }) => {
          setAccount(account)
          setTenants(tenants)
          setSelectedTenantId(selectedTenantId)
          setAuthState(AUTH.APP)
          window.location.hash = '#/platform' // clear the invite token from URL
        }}
        onCancel={() => {
          window.location.hash = '#/platform'
          checkSession()
        }}
      />
    )
  }

  // ---- Render: App shell with sidebar ----

  // Render the active content view
  function renderContent() {
    if (!selectedTenantId) {
      return <PlaceholderView title={t('noTenantSelected')} description={t('noTenantSelectedDesc')} />
    }

    switch (activeView) {
      case 'dashboard':
        return <DashboardView tenantId={selectedTenantId} onNavigate={navigate} />

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
        return <RosterView tenantId={selectedTenantId} account={account} focusEventId={focusEventId} onFocusHandled={() => setFocusEventId(null)} />

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

      case 'members':
        return (
          <MembersPage
            tenantId={selectedTenantId}
            currentAccountId={account?.id}
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
        return <PlaceholderView title="Not Found" description={t('viewNotFound', activeView)} />
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

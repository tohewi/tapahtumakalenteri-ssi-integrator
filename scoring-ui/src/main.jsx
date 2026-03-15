import { StrictMode, Component, Suspense, lazy, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Route-level code splitting — each route loads its own chunk on first navigation
const HomePage = lazy(() => import('./components/HomePage.jsx'))
const App = lazy(() => import('./App.jsx'))
const TabletApp = lazy(() => import('./TabletApp.jsx'))
const RegisterPage = lazy(() => import('./components/RegisterPage.jsx'))
const ManagePage = lazy(() => import('./components/ManagePage.jsx'))
const ReportPage = lazy(() => import('./components/ReportPage.jsx'))
const SummaryReportPage = lazy(() => import('./components/SummaryReportPage.jsx'))
const StaffingPage = lazy(() => import('./components/StaffingPage.jsx'))
const AdminPage = lazy(() => import('./components/AdminPage.jsx'))
// PlatformApp is the largest — lazy-load it and its 20+ sub-components
const PlatformApp = lazy(() => import('./components/platform/PlatformApp.jsx'))

// Error boundary to catch runtime crashes and display a useful error instead of a blank page
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught error:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ color: '#dc2626' }}>Something went wrong</h1>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#991b1b', background: '#fef2f2', padding: '1rem', borderRadius: '0.5rem', marginTop: '1rem' }}>
            {this.state.error?.message || 'Unknown error'}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function Router() {
  const [route, setRoute] = useState(window.location.hash)

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Suspense fallback shown while lazy chunks load
  const fallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#9ca3af', fontFamily: 'system-ui, sans-serif' }}>
      Loading...
    </div>
  )

  let content
  if (route === '#/scoring') {
    content = <App />
  } else if (route === '#/scoring-tablet') {
    content = <TabletApp />
  } else if (route === '#/register') {
    content = <RegisterPage />
  } else if (route === '#/manage') {
    content = <ManagePage />
  } else if (route === '#/report') {
    content = <ReportPage />
  } else if (route === '#/summary') {
    content = <SummaryReportPage />
  } else if (route === '#/staffing') {
    content = <StaffingPage />
  } else if (route === '#/platform' || route.startsWith('#/platform/')) {
    content = <PlatformApp route={route} />
  } else if (route === '#/admin') {
    content = <AdminPage />
  } else {
    content = <HomePage />
  }

  return <Suspense fallback={fallback}>{content}</Suspense>
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Router />
    </ErrorBoundary>
  </StrictMode>,
)

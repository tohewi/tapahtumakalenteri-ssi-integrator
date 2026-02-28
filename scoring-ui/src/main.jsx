import { StrictMode, Component, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import HomePage from './components/HomePage.jsx'
import App from './App.jsx'
import TabletApp from './TabletApp.jsx'
import RegisterPage from './components/RegisterPage.jsx'
import ManagePage from './components/ManagePage.jsx'
import ReportPage from './components/ReportPage.jsx'
import SummaryReportPage from './components/SummaryReportPage.jsx'
import StaffingPage from './components/StaffingPage.jsx'
import { PlatformApp } from './components/platform/index.js'

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

  if (route === '#/scoring') {
    return <App />
  }
  if (route === '#/scoring-tablet') {
    return <TabletApp />
  }
  if (route === '#/register') {
    return <RegisterPage />
  }
  if (route === '#/manage') {
    return <ManagePage />
  }
  if (route === '#/report') {
    return <ReportPage />
  }
  if (route === '#/summary') {
    return <SummaryReportPage />
  }
  if (route === '#/staffing') {
    return <StaffingPage />
  }
  if (route === '#/platform' || route.startsWith('#/platform/')) {
    return <PlatformApp route={route} />
  }
  return <HomePage />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Router />
    </ErrorBoundary>
  </StrictMode>,
)

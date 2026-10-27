import { StrictMode, Component, Suspense, lazy, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import HomePage from './components/HomePage.jsx'
import App from './App.jsx'
import RegisterPage from './components/RegisterPage.jsx'
import ManagePage from './components/ManagePage.jsx'
import LegalDocumentPage from './components/LegalDocumentPage.jsx'

const TabletApp = lazy(() => import('./TabletApp.jsx'))
const ReportPage = lazy(() => import('./components/ReportPage.jsx'))
const SummaryReportPage = lazy(() => import('./components/SummaryReportPage.jsx'))
const GunsPage = lazy(() => import('./components/GunsPage.jsx'))
const AmmoPage = lazy(() => import('./components/AmmoPage.jsx'))

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif', maxWidth: 480, margin: '40px auto' }}>
          <h2 style={{ color: '#dc2626', marginBottom: 8 }}>Sovellusvirhe / Application Error</h2>
          <p style={{ color: '#4b5563', fontSize: 14, marginBottom: 16 }}>
            {this.state.error?.message || 'Tuntematon virhe'}
          </p>
          <button
            onClick={() => {
              localStorage.clear()
              window.location.reload()
            }}
            style={{
              background: '#2563eb', color: 'white', border: 'none',
              padding: '10px 20px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
            }}
          >
            Tyhjennä välimuisti ja lataa uudelleen
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function Router() {
  const [hash, setHash] = useState(window.location.hash)

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const path = hash.split('?')[0]

  let page = <HomePage />
  if (path === '#/register') {
    page = <RegisterPage />
  } else if (path === '#/manage') {
    page = <ManagePage />
  } else if (path === '#/report') {
    page = <ReportPage />
  } else if (path === '#/summary') {
    page = <SummaryReportPage />
  } else if (path === '#/guns') {
    page = <GunsPage />
  } else if (path === '#/ammo') {
    page = <AmmoPage />
  } else if (path === '#/privacy') {
    page = <LegalDocumentPage type="privacy" />
  } else if (path === '#/privacy-guns') {
    page = <LegalDocumentPage type="privacy-guns" />
  } else if (path === '#/terms') {
    page = <LegalDocumentPage type="terms" />
  } else if (path === '#/scoring') {
    page = <App />
  } else if (path === '#/scoring-tablet') {
    page = <TabletApp />
  }

  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500 text-sm">Ladataan...</div>}>
      {page}
    </Suspense>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Router />
    </ErrorBoundary>
  </StrictMode>,
)

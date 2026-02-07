import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import HomePage from './components/HomePage.jsx'
import App from './App.jsx'
import RegisterPage from './components/RegisterPage.jsx'
import ManagePage from './components/ManagePage.jsx'
import ReportPage from './components/ReportPage.jsx'

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
  if (route === '#/register') {
    return <RegisterPage />
  }
  if (route === '#/manage') {
    return <ManagePage />
  }
  if (route === '#/report') {
    return <ReportPage />
  }
  return <HomePage />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router />
  </StrictMode>,
)

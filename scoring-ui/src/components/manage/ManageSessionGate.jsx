import { useEffect, useState } from 'react'
import { AppHeader, ErrorBanner, Spinner } from '../shared'

export default function ManageSessionGate({ children }) {
  const [session, setSession] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const checkSession = async () => {
      try {
        const response = await fetch('/api/v1/auth/status', {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })
        let authenticated = false
        if (response.status !== 401) {
          if (!response.ok) throw new Error('Session check failed')
          const status = await response.json()
          if (typeof status?.authenticated !== 'boolean') throw new Error('Invalid session status')
          authenticated = status.authenticated && status.scope === 'manage'
        }
        if (!controller.signal.aborted) setSession({ authenticated })
      } catch {
        if (!controller.signal.aborted) setSession({ error: true })
      }
    }
    checkSession()
    return () => controller.abort()
  }, [attempt])

  if (session && !session.error) return children(session.authenticated)

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="SSI apurit — Hallinta" />
      {session?.error ? (
        <div className="text-center">
          <div role="alert">
            <ErrorBanner error="Istunnon tarkistus epäonnistui. Yritä uudelleen." />
          </div>
          <button
            type="button"
            className="m-3 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold active:bg-blue-700"
            onClick={() => {
              setSession(null)
              setAttempt(value => value + 1)
            }}
          >
            Yritä uudelleen
          </button>
        </div>
      ) : (
        <div role="status" className="text-center text-gray-600">
          <Spinner />
          <p>Tarkistetaan istuntoa...</p>
        </div>
      )}
    </div>
  )
}

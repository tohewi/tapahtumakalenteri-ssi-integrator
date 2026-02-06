import { useState, useEffect } from 'react'

export default function LoginScreen({ onLogin, initialEmail, initialPassword, initialApiKey }) {
  const [email, setEmail] = useState(initialEmail || '')
  const [password, setPassword] = useState(initialPassword || '')
  const [apiKey, setApiKey] = useState(initialApiKey || '')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Sync fields when saved credentials arrive (async decryption)
  useEffect(() => {
    if (initialEmail) setEmail(initialEmail)
    if (initialPassword) setPassword(initialPassword)
    if (initialApiKey) setApiKey(initialApiKey)
  }, [initialEmail, initialPassword, initialApiKey])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await onLogin(email, password, apiKey, rememberMe)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white px-4 py-5">
        <h1 className="text-xl font-bold">SSI Scoring</h1>
        <p className="text-blue-200 text-sm mt-1">Login to start scoring</p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 p-4 max-w-sm mx-auto w-full">
        <div className="space-y-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="SSI password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              placeholder="optional — for GraphQL reads"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={e => setRememberMe(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Remember me</span>
        </label>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full mt-6 py-3 bg-blue-600 text-white rounded-xl font-semibold text-lg active:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  )
}

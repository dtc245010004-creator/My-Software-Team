import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { clearSession, loadStoredSession, performLogin } from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => loadStoredSession())
  const [status, setStatus] = useState('idle')

  const login = useCallback(async (email, password) => {
    setStatus('loading')
    try {
      const result = await performLogin(email, password)
      setSession({ token: result.token, user: result.user })
      setStatus('idle')
      return result
    } catch (err) {
      setStatus('idle')
      throw err
    }
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      isAuthenticated: Boolean(session?.token),
      status,
      login,
      logout,
    }),
    [session, status, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { api, session, type AuthUser } from './api'

interface LoginResponse {
  access: string
  refresh: string
  user: AuthUser
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isAdmin: boolean
  hasRole: (...roles: string[]) => boolean
  login: (username: string, password: string) => Promise<AuthUser>
  logout: () => void
  updateUser: (user: AuthUser) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => session.user)
  const queryClient = useQueryClient()

  const login = useCallback(async (username: string, password: string) => {
    const { data } = await api.post<LoginResponse>('/auth/login', { username, password })
    session.save(data.access, data.refresh, data.user)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    session.clear()
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  const updateUser = useCallback((next: AuthUser) => {
    const refresh = session.refresh
    const access = session.access
    if (access && refresh) session.save(access, refresh, next)
    setUser(next)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAdmin: Boolean(user?.is_superuser || user?.role === 'admin'),
      hasRole: (...roles: string[]) =>
        Boolean(user && (user.is_superuser || roles.includes(user.role))),
      login,
      logout,
      updateUser,
    }),
    [user, login, logout, updateUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

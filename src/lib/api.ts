import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const ACCESS_KEY = 'hospital.access_token'
const REFRESH_KEY = 'hospital.refresh_token'
const USER_KEY = 'hospital.user'

export interface AuthUser {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  full_name: string
  role: string
  phone: string
  is_active: boolean
  is_superuser: boolean
}

export const session = {
  get access() {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  get user(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as AuthUser
    } catch {
      return null
    }
  },
  save(access: string, refresh: string, user: AuthUser) {
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
  },
}

// Relative by default so the Vite dev proxy handles it. When the SPA is hosted
// somewhere other than the API, set VITE_API_URL at build time to the absolute
// API root, e.g. https://massacre.pythonanywhere.com/api
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

api.interceptors.request.use((config) => {
  const token = session.access
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/** Shared in-flight refresh so a burst of 401s only triggers one refresh call. */
let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refresh = session.refresh
  if (!refresh) return null
  try {
    const { data } = await axios.post('/api/auth/refresh', { refresh })
    const user = session.user
    if (user) session.save(data.access, refresh, user)
    else localStorage.setItem(ACCESS_KEY, data.access)
    return data.access as string
  } catch {
    return null
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean }
    const status = error.response?.status
    const isAuthCall = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh')

    if (status === 401 && original && !original._retried && !isAuthCall && session.refresh) {
      original._retried = true
      refreshInFlight = refreshInFlight ?? refreshAccessToken()
      const token = await refreshInFlight
      refreshInFlight = null

      if (token) {
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      }

      session.clear()
      if (window.location.pathname !== '/login') window.location.href = '/login'
    }

    return Promise.reject(error)
  },
)

/** Turn any axios failure into a message worth showing a user. */
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Record<string, unknown> | undefined
    if (data) {
      if (typeof data.detail === 'string') return data.detail
      // Ninja validation errors arrive as { detail: [{loc, msg, type}] }
      if (Array.isArray(data.detail)) {
        return data.detail
          .map((item) => (item as { msg?: string }).msg ?? JSON.stringify(item))
          .join(', ')
      }
      if (typeof data.message === 'string') return data.message
    }
    if (error.code === 'ERR_NETWORK') return 'Cannot reach the API server. Is Django running?'
    return error.message
  }
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

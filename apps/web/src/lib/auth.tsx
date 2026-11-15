import * as React from "react"
import { Navigate, useLocation } from "react-router"
import type { Role, User } from "shared"
import { ROLE_META } from "shared"
import { api, tokenStore } from "./api"
import i18n from "./i18n"

type AuthState = {
  user: User | null
  loading: boolean
  login: (role: Role, username: string, secret: string) => Promise<User>
  logout: () => void
  setLanguage: (lng: "en" | "si") => Promise<void>
}

const AuthContext = React.createContext<AuthState | undefined>(undefined)
const USER_KEY = "ak-user"

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(() => (tokenStore.get() ? readCachedUser() : null))
  const [loading, setLoading] = React.useState(Boolean(tokenStore.get()))

  const persist = React.useCallback((u: User | null) => {
    setUser(u)
    try {
      if (u) localStorage.setItem(USER_KEY, JSON.stringify(u))
      else localStorage.removeItem(USER_KEY)
    } catch {
      /* ignore */
    }
    if (u) void i18n.changeLanguage(u.language)
  }, [])

  React.useEffect(() => {
    // `loading` already starts false when there is no token.
    if (!tokenStore.get()) return
    // Offline: keep the cached user so the POS and driver app still open.
    api
      .get<User>("/auth/me")
      .then((u) => persist(u))
      .catch(() => {
        if (!navigator.onLine) return
        tokenStore.set(null)
        persist(null)
      })
      .finally(() => setLoading(false))
  }, [persist])

  React.useEffect(() => {
    const onUnauthorized = () => persist(null)
    window.addEventListener("ak:unauthorized", onUnauthorized)
    return () => window.removeEventListener("ak:unauthorized", onUnauthorized)
  }, [persist])

  const value = React.useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: async (role, username, secret) => {
        const res = await api.post<{ token: string; user: User }>("/auth/login", { role, username, secret })
        tokenStore.set(res.token)
        persist(res.user)
        return res.user
      },
      logout: () => {
        tokenStore.set(null)
        persist(null)
      },
      setLanguage: async (language) => {
        const u = await api.patch<User>("/auth/me/language", { language })
        persist(u)
      },
    }),
    [user, loading, persist]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

export function useUser(): User {
  const { user } = useAuth()
  if (!user) throw new Error("No signed-in user")
  return user
}

/** Wraps a role's app: redirects to sign-in when logged out, or to the right app when the role doesn't match. */
export function RequireRole({ role, children }: { role: Role; children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        <span className="animate-pulse">Loading…</span>
      </div>
    )
  }
  if (!user) return <Navigate to={`/sign-in/${role.toLowerCase()}`} state={{ from: location.pathname }} replace />
  if (user.role !== role) {
    // Owner may also use the office desktop (spec §3).
    const allowed = role === "OFFICE" && user.role === "OWNER"
    if (!allowed) return <Navigate to={ROLE_META[user.role].home} replace />
  }
  return <>{children}</>
}

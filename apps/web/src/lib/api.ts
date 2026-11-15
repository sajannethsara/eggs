const BASE = import.meta.env.VITE_API_URL ?? "/api"
const TOKEN_KEY = "ak-token"

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* private mode */
    }
  },
}

export class ApiError extends Error {
  status: number
  body: unknown
  code?: string
  constructor(status: number, body: unknown) {
    const b = body as { message?: string | string[]; code?: string } | null
    const msg = Array.isArray(b?.message) ? b.message.join(", ") : b?.message
    super(msg ?? `Request failed (${status})`)
    this.status = status
    this.body = body
    this.code = b?.code
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

async function request<T>(method: Method, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" }
  if (body !== undefined) headers["Content-Type"] = "application/json"
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  if (res.status === 401 && !path.startsWith("/auth/login")) {
    tokenStore.set(null)
    window.dispatchEvent(new Event("ak:unauthorized"))
  }
  const text = await res.text()
  const data = text ? (JSON.parse(text) as unknown) : null
  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>("GET", path, undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
}

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v))
  const s = sp.toString()
  return s ? `?${s}` : ""
}

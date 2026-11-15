import * as React from "react"
import { useTranslation } from "react-i18next"
import { Link, Navigate, useNavigate, useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Delete, Lock } from "lucide-react"
import { toast } from "sonner"
import { ROLES, ROLE_META, type Role } from "shared"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { cn, initials } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"

type RoleUser = { username: string; displayName: string; outletName: string | null }

export function SignInPage() {
  const { t } = useTranslation()
  const params = useParams()
  const navigate = useNavigate()
  const { login, user } = useAuth()
  const role = (params.role ?? "").toUpperCase() as Role
  const valid = (ROLES as readonly string[]).includes(role)
  const usesPin = valid && (role === "CASHIER" || role === "DRIVER" || role === "WAREHOUSE")

  const users = useQuery({
    queryKey: ["role-users", role],
    queryFn: () => api.get<RoleUser[]>(`/auth/roles/${role}/users`),
    enabled: valid,
  })

  const [selected, setSelected] = React.useState<RoleUser | null>(null)
  const [username, setUsername] = React.useState("")
  const [secret, setSecret] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (users.data?.length === 1) setSelected(users.data[0])
  }, [users.data])

  if (!valid) return <Navigate to="/" replace />
  if (user && user.role === role) return <Navigate to={ROLE_META[role].home} replace />

  const submit = async (pin?: string) => {
    const name = selected?.username ?? username
    const code = pin ?? secret
    if (!name || !code) return
    setBusy(true)
    try {
      await login(role, name, code)
      navigate(ROLE_META[role].home, { replace: true })
    } catch {
      toast.error(t("signin.wrong"))
      setSecret("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="phone flex min-h-svh items-center justify-center bg-muted/40 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex items-center justify-between">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link to="/">
                <ArrowLeft className="size-4" />
                {t("signin.back")}
              </Link>
            </Button>
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-primary">{ROLE_META[role].app}</span>
          </div>
          <CardTitle className="text-2xl">{t(`roles.${role}`)}</CardTitle>
          <CardDescription>{selected ? (usesPin ? t("signin.pin") : t("signin.password")) : t("signin.who")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!selected ? (
            users.isLoading ? (
              <div className="grid gap-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : users.data && users.data.length > 0 ? (
              <div className="grid gap-2">
                {users.data.map((u) => (
                  <button
                    key={u.username}
                    type="button"
                    onClick={() => setSelected(u)}
                    className="flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors hover:border-primary/60 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Avatar className="size-10">
                      <AvatarFallback className="bg-primary/20 font-semibold">{initials(u.displayName)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{u.displayName}</span>
                      {u.outletName ? <span className="block truncate text-sm text-muted-foreground">{u.outletName}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{users.isError ? t("common.error") : t("signin.noUsers", { role: t(`roles.${role}`).toLowerCase() })}</p>
                <div className="space-y-2">
                  <Label htmlFor="username">{t("signin.username")}</Label>
                  <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
                <Button className="w-full" disabled={!username} onClick={() => setSelected({ username, displayName: username, outletName: null })}>
                  {t("common.confirm")}
                </Button>
              </div>
            )
          ) : (
            <>
              <button type="button" className="flex w-full items-center gap-3 rounded-xl bg-muted px-3 py-2 text-left" onClick={() => setSelected(null)}>
                <Avatar className="size-10">
                  <AvatarFallback className="bg-primary/20 font-semibold">{initials(selected.displayName)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{selected.displayName}</span>
                  <span className="block text-xs text-muted-foreground">{t("home.switch")}</span>
                </span>
              </button>

              {usesPin ? (
                <PinPad value={secret} onChange={setSecret} onComplete={(pin) => void submit(pin)} disabled={busy} />
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void submit()
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="password">{t("signin.password")}</Label>
                    <Input id="password" type="password" autoFocus autoComplete="current-password" value={secret} onChange={(e) => setSecret(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" size="lg" disabled={busy || !secret}>
                    <Lock className="size-4" />
                    {t("signin.submit")}
                  </Button>
                </form>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Large 4-digit PIN pad (spec §11.1), 64px targets so it works with a thumb in sunlight. */
export function PinPad({
  value,
  onChange,
  onComplete,
  disabled,
  length = 4,
}: {
  value: string
  onChange: (v: string) => void
  onComplete: (v: string) => void
  disabled?: boolean
  length?: number
}) {
  const press = (d: string) => {
    if (disabled) return
    const next = (value + d).slice(0, length)
    onChange(next)
    if (next.length === length) onComplete(next)
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-3" aria-label="PIN">
        {Array.from({ length }).map((_, i) => (
          <span key={i} className={cn("size-3.5 rounded-full border-2 transition-colors", i < value.length ? "border-primary bg-primary" : "border-muted-foreground/40")} />
        ))}
      </div>
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Button key={d} type="button" variant="outline" className="h-16 text-xl font-semibold" onClick={() => press(d)} disabled={disabled}>
            {d}
          </Button>
        ))}
        <span />
        <Button type="button" variant="outline" className="h-16 text-xl font-semibold" onClick={() => press("0")} disabled={disabled}>
          0
        </Button>
        <Button type="button" variant="ghost" className="h-16" onClick={() => onChange(value.slice(0, -1))} disabled={disabled} aria-label="Delete">
          <Delete className="size-6" />
        </Button>
      </div>
    </div>
  )
}

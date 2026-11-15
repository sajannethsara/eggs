import { useTranslation } from "react-i18next"
import { Link, Navigate } from "react-router"
import { Crown, Monitor, Receipt, Truck, Warehouse, ArrowRight, Egg } from "lucide-react"
import { ROLES, ROLE_META, type Role } from "shared"
import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const ICONS: Record<Role, React.ComponentType<{ className?: string }>> = {
  OWNER: Crown,
  OFFICE: Monitor,
  CASHIER: Receipt,
  DRIVER: Truck,
  WAREHOUSE: Warehouse,
}

export function HomePage() {
  const { t, i18n } = useTranslation()
  const { user, loading, logout } = useAuth()

  if (!loading && user && !sessionStorage.getItem("ak-stay-home")) {
    return <Navigate to={ROLE_META[user.role].home} replace />
  }

  return (
    <div className="min-h-svh bg-[radial-gradient(ellipse_at_top,_var(--color-primary)/18%,_transparent_60%)]">
      <div className="mx-auto flex min-h-svh max-w-5xl flex-col px-4 py-8 sm:px-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Egg className="size-5" />
            </span>
            <div>
              <div className="font-semibold leading-tight">{t("app.name")}</div>
              <div className="text-xs text-muted-foreground">{t("app.tagline")}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void i18n.changeLanguage(i18n.language === "en" ? "si" : "en")}>
            {i18n.language === "en" ? "සිංහල" : "English"}
          </Button>
        </header>

        <main className="flex flex-1 flex-col justify-center py-10">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("home.title")}</h1>
            <p className="mt-2 text-muted-foreground">{t("home.subtitle")}</p>
          </div>

          {user ? (
            <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" onClick={() => sessionStorage.removeItem("ak-stay-home")}>
                <Link to={ROLE_META[user.role].home}>
                  {t("home.continue", { name: user.displayName })}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" onClick={logout}>
                {t("home.switch")}
              </Button>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {ROLES.map((role) => {
              const Icon = ICONS[role]
              const meta = ROLE_META[role]
              return (
                <Link key={role} to={`/sign-in/${role.toLowerCase()}`} className="group outline-none" onClick={() => sessionStorage.removeItem("ak-stay-home")}>
                  <Card
                    className={cn(
                      "h-full gap-3 p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-primary/60 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring",
                      "lg:min-h-48"
                    )}
                  >
                    <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-amber-700 transition-colors group-hover:bg-primary group-hover:text-primary-foreground dark:text-primary">
                      <Icon className="size-6" />
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold">{t(`roles.${role}`)}</div>
                      <p className="text-sm leading-snug text-muted-foreground">{t(`roles.${role}_desc`)}</p>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-1 text-xs text-muted-foreground">
                      <span className="capitalize">{meta.device}</span>
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        </main>

        <footer className="text-center text-xs text-muted-foreground">
          Customers and suppliers don't sign in. Staff record every call, delivery and payment for them.
        </footer>
      </div>
    </div>
  )
}

import * as React from "react"
import { NavLink, Outlet } from "react-router"
import { useTranslation } from "react-i18next"
import { Inbox, ClipboardList, Truck, Boxes, BookUser, Wallet, Users, BarChart3, ListChecks, Egg } from "lucide-react"
import { useInbox, useMyWork } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { SyncChip, UserMenu } from "@/components/common"
import { QuickCapture } from "./quick-capture"
import { TooltipProvider } from "@/components/ui/tooltip"

/** Office desktop: left sidebar + pinned Quick capture bar (spec §9). */
export function OfficeLayout() {
  const { t } = useTranslation()
  const inbox = useInbox("mine")
  const tasks = useMyWork()
  const nav = [
    { to: "/office/inbox", icon: Inbox, label: t("nav.office.inbox"), badge: inbox.data?.length },
    { to: "/office/orders", icon: ClipboardList, label: t("nav.office.orders") },
    { to: "/office/deliveries", icon: Truck, label: t("nav.office.deliveries") },
    { to: "/office/stock", icon: Boxes, label: t("nav.office.stock") },
    { to: "/office/directory", icon: BookUser, label: t("nav.office.directory") },
    { to: "/office/money", icon: Wallet, label: t("nav.office.money") },
  ]
  const nav2 = [
    { to: "/office/staff", icon: Users, label: t("nav.office.staff") },
    { to: "/office/tasks", icon: ListChecks, label: t("nav.office.tasks"), badge: tasks.data?.length },
    { to: "/owner/reports", icon: BarChart3, label: t("nav.office.reports") },
  ]
  const [open, setOpen] = React.useState(false)

  return (
    <TooltipProvider>
      <div className="flex min-h-svh bg-muted/30">
        <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
          <div className="flex items-center gap-2 px-4 py-4">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Egg className="size-4" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold">{t("app.name")}</div>
              <div className="text-xs text-muted-foreground">Office desktop</div>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 px-2">
            {nav.map((n) => (
              <SideLink key={n.to} {...n} />
            ))}
            <div className="my-2 border-t" />
            {nav2.map((n) => (
              <SideLink key={n.to} {...n} />
            ))}
          </nav>
          <div className="border-t p-2">
            <UserMenu />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/95 px-4 py-2 backdrop-blur">
            <button type="button" className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
              <Egg className="size-6 text-primary" />
            </button>
            <div className="min-w-0 flex-1">
              <QuickCapture />
            </div>
            <SyncChip />
            <div className="md:hidden">
              <UserMenu compact />
            </div>
          </header>
          {open ? (
            <nav className="grid grid-cols-3 gap-1 border-b bg-background p-2 md:hidden">
              {[...nav, ...nav2].map((n) => (
                <SideLink key={n.to} {...n} onClick={() => setOpen(false)} />
              ))}
            </nav>
          ) : null}
          <main className="flex-1 p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}

function SideLink({ to, icon: Icon, label, badge, onClick }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string; badge?: number; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn("flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground", isActive && "bg-primary/15 text-amber-900 dark:text-primary")
      }
    >
      <Icon className="size-4" />
      <span className="flex-1">{label}</span>
      {badge ? <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular">{badge}</span> : null}
    </NavLink>
  )
}

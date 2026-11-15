import { NavLink, Outlet } from "react-router"
import { useTranslation } from "react-i18next"
import { CalendarDays, CheckSquare, ListTodo, Users, BarChart3 } from "lucide-react"
import { useOwnerQueue, useMyWork } from "@/lib/queries"
import { MobileFrame, BottomBar } from "@/components/frames"
import { cn } from "@/lib/utils"

export function OwnerLayout() {
  const { t } = useTranslation()
  const queue = useOwnerQueue()
  const work = useMyWork()
  const approveCount = queue.data?.reduce((s, g) => s + g.items.length, 0) ?? 0
  const workCount = work.data?.length ?? 0

  const tabs = [
    { to: "/owner", end: true, icon: CalendarDays, label: t("nav.owner.today") },
    { to: "/owner/approve", icon: CheckSquare, label: t("nav.owner.approve"), badge: approveCount },
    { to: "/owner/work", icon: ListTodo, label: t("nav.owner.work"), badge: workCount },
    { to: "/owner/contacts", icon: Users, label: t("nav.owner.contacts") },
    { to: "/owner/reports", icon: BarChart3, label: t("nav.owner.reports") },
  ]

  return (
    <MobileFrame>
      <Outlet />
      <BottomBar>
        {tabs.map(({ to, end, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium text-muted-foreground transition-colors",
                isActive && "bg-primary/15 text-amber-900 dark:text-primary"
              )
            }
          >
            <Icon className="size-5" />
            {label}
            {badge ? (
              <span className="absolute top-1 right-1/2 translate-x-4 rounded-full bg-status-red px-1.5 text-[10px] font-semibold text-white tabular">{badge}</span>
            ) : null}
          </NavLink>
        ))}
      </BottomBar>
    </MobileFrame>
  )
}

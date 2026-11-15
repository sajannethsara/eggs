import { NavLink, Outlet } from "react-router"
import { useTranslation } from "react-i18next"
import { ListOrdered, PackageOpen, Flag } from "lucide-react"
import { MobileFrame, BottomBar } from "@/components/frames"
import { cn } from "@/lib/utils"

export function DriverLayout() {
  const { t } = useTranslation()
  const tabs = [
    { to: "/driver/load", icon: PackageOpen, label: t("nav.driver.load") },
    { to: "/driver", end: true, icon: ListOrdered, label: t("nav.driver.stops") },
    { to: "/driver/end", icon: Flag, label: t("nav.driver.end") },
  ]
  return (
    <MobileFrame>
      <Outlet />
      <BottomBar>
        {tabs.map(({ to, end, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cn("flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium text-muted-foreground", isActive && "bg-primary/15 text-amber-900 dark:text-primary")}>
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </BottomBar>
    </MobileFrame>
  )
}

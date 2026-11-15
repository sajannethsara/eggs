import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { TrendingUp, TrendingDown, Wallet, PackageSearch, Clock, ChevronRight, Phone } from "lucide-react"
import { useOwnerToday, useParties } from "@/lib/queries"
import { useUser } from "@/lib/auth"
import { cn, formatRsShort, formatTime, telHref } from "@/lib/utils"
import { PhoneHeader, Screen } from "@/components/frames"
import { SyncChip, UserMenu, ErrorState, ListSkeleton, HealthDot, SectionTitle, HelpButton } from "@/components/common"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Movement } from "@/lib/types"

export function OwnerToday() {
  const { t } = useTranslation()
  const user = useUser()
  const today = useOwnerToday()
  const red = useParties({ red: true })
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  return (
    <>
      <PhoneHeader
        title={`${greeting}, ${user.displayName.split(" ")[0]}`}
        subtitle={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        right={
          <div className="flex items-center gap-1">
            <SyncChip />
            <HelpButton title="Today" steps={["The four cards answer: how is the business today?", "Tap a card to open the detail.", "Red profiles are customers or suppliers who need a call.", "The feed shows the last 10 important events."]} />
            <UserMenu compact />
          </div>
        }
      />
      <Screen>
        {today.isError ? (
          <ErrorState error={today.error} onRetry={() => void today.refetch()} />
        ) : today.isLoading || !today.data ? (
          <ListSkeleton rows={3} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Kpi
                to="/owner/reports"
                label="Sales today"
                value={formatRsShort(today.data.kpis.salesTodayCents)}
                sub={<Delta now={today.data.kpis.salesTodayCents} then={today.data.kpis.salesLastWeekCents} />}
                icon={TrendingUp}
              />
              <Kpi
                to="/owner/reports"
                label="Collected today"
                value={formatRsShort(today.data.kpis.collectedTodayCents)}
                sub={<span className="text-muted-foreground">due {formatRsShort(today.data.kpis.dueTodayCents)}</span>}
                icon={Wallet}
              />
              <Kpi
                to="/office/stock"
                label="Stock alerts"
                value={String(today.data.kpis.stockAlerts)}
                sub={<span className="text-muted-foreground">low or aging</span>}
                icon={PackageSearch}
                tone={today.data.kpis.stockAlerts > 0 ? "amber" : "green"}
              />
              <Kpi
                to="/office/deliveries"
                label="Late deliveries"
                value={String(today.data.kpis.lateDeliveries)}
                sub={<span className="text-muted-foreground">right now</span>}
                icon={Clock}
                tone={today.data.kpis.lateDeliveries > 0 ? "red" : "green"}
              />
            </div>

            <section className="space-y-2">
              <SectionTitle>Outlets</SectionTitle>
              <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
                {today.data.outlets.map((o) => (
                  <Card key={o.id} size="sm" className="min-w-40 shrink-0 gap-1 px-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">{o.name.replace(/^Outlet \d · /, "")}</span>
                      <span className="size-2 rounded-full bg-status-green" title="online" />
                    </div>
                    <div className="text-lg font-semibold tabular">{formatRsShort(o.salesCents)}</div>
                    <div className={cn("text-xs", o.alerts ? "text-amber-700 dark:text-status-amber" : "text-muted-foreground")}>
                      {o.alerts ? `${o.alerts} stock alert${o.alerts > 1 ? "s" : ""}` : "stock ok"}
                    </div>
                  </Card>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <SectionTitle action={<Link to="/owner/contacts?red=1" className="text-xs font-medium text-primary">{t("common.all")}</Link>}>Red profiles</SectionTitle>
              {red.data && red.data.length > 0 ? (
                <Card className="divide-y py-0">
                  {red.data.slice(0, 4).map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                      <HealthDot colour="red" />
                      <Link to={`/owner/contacts/${p.id}`} className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {p.health?.overdueCents ? `${formatRsShort(p.health.overdueCents)} overdue` : null}
                          {p.health?.daysSinceOrder != null ? ` · ${p.health.daysSinceOrder}d since order` : null}
                        </div>
                      </Link>
                      {p.phone ? (
                        <Button asChild size="icon-lg" variant="outline" aria-label={t("common.call")}>
                          <a href={telHref(p.phone)}>
                            <Phone className="size-4" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </Card>
              ) : (
                <p className="text-sm text-muted-foreground">No red profiles. Every relationship is healthy.</p>
              )}
            </section>

            <section className="space-y-2">
              <SectionTitle>Live feed</SectionTitle>
              <Card className="divide-y py-0">
                {today.data.feed.length === 0 ? <p className="px-3 py-4 text-sm text-muted-foreground">{t("common.empty")}</p> : null}
                {today.data.feed.map((m) => (
                  <FeedRow key={m.id} m={m} />
                ))}
              </Card>
            </section>
          </>
        )}
      </Screen>
    </>
  )
}

function Kpi({ to, label, value, sub, icon: Icon, tone = "grey" }: { to: string; label: string; value: string; sub?: React.ReactNode; icon: React.ComponentType<{ className?: string }>; tone?: "grey" | "amber" | "red" | "green" }) {
  return (
    <Link to={to} className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
      <Card size="sm" className="h-full gap-2 px-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <Icon className={cn("size-4", tone === "amber" && "text-status-amber", tone === "red" && "text-status-red", tone === "green" && "text-status-green")} />
        </div>
        <div className="text-xl font-semibold tabular">{value}</div>
        <div className="flex items-center justify-between text-xs">
          {sub}
          <ChevronRight className="size-3.5 text-muted-foreground" />
        </div>
      </Card>
    </Link>
  )
}

function Delta({ now, then }: { now: number; then: number }) {
  if (then === 0) return <span className="text-muted-foreground">vs last week —</span>
  const pct = Math.round(((now - then) / then) * 100)
  const up = pct >= 0
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-status-green" : "text-status-red")}>
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? "+" : ""}
      {pct}% vs last week
    </span>
  )
}

function FeedRow({ m }: { m: Movement }) {
  const who = m.by?.displayName ?? "System"
  let text: string
  if (m.kind === "MONEY") {
    text = `${who}: ${formatRsShort(m.amountCents ?? 0)} ${m.method?.toLowerCase().replace("_", " ")} from ${m.fromParty?.name} to ${m.toParty?.name}`
  } else {
    text = `${who}: ${m.quantity} ${m.item?.name ?? ""} ${m.fromParty?.name} → ${m.toParty?.name}`
  }
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <span className="mt-0.5 w-11 shrink-0 text-xs text-muted-foreground tabular">{formatTime(m.occurredAt)}</span>
      <span className="text-sm leading-snug">{text}</span>
    </div>
  )
}

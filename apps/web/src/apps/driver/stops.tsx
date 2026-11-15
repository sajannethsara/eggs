import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { Phone, Truck, PackageOpen, ChevronRight, MapPin } from "lucide-react"
import { useRoute } from "@/lib/queries"
import { useUser } from "@/lib/auth"
import type { RouteView } from "@/lib/types"
import { cn, formatRsShort, telHref, packs } from "@/lib/utils"
import { PhoneHeader, Screen } from "@/components/frames"
import { SyncChip, UserMenu, EmptyState, ListSkeleton, StatusBadge, HelpButton } from "@/components/common"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

/** Today's stops in route order; the next one is expanded (spec §11.2). */
export function DriverStops() {
  const { t } = useTranslation()
  const user = useUser()
  const route = useRoute(undefined, user.id)
  const navigate = useNavigate()
  const stops = route.data?.stops ?? []
  const done = stops.filter((s) => s.status === "DONE").length
  const nextId = stops.find((s) => s.status !== "DONE" && s.stopStatus !== "SKIPPED")?.id

  return (
    <>
      <PhoneHeader
        title={stops.length ? `${done} of ${stops.length} done` : "Today's stops"}
        subtitle={
          <span>
            {t("driver.cashInHand")}: <span className="font-semibold text-foreground tabular">{formatRsShort(route.data?.cashCents ?? 0)}</span>
          </span>
        }
        right={
          <div className="flex items-center gap-1">
            <SyncChip />
            <HelpButton title="Stops" steps={["Work the list from top to bottom. The next stop is open.", "Tap Arrived, confirm the items, choose how they pay.", "The customer signs on your phone. Done.", "No signal? Everything is saved and sent later."]} />
            <UserMenu compact />
          </div>
        }
      />
      <Screen>
        {route.isLoading ? (
          <ListSkeleton />
        ) : stops.length === 0 ? (
          <EmptyState icon={Truck} title="No stops today" hint="The office sends your route the evening before." />
        ) : (
          stops.map((s) => <StopCard key={s.id} s={s} expanded={s.id === nextId} onOpen={() => navigate(`/driver/stop/${s.id}`)} />)
        )}
      </Screen>
    </>
  )
}

function StopCard({ s, expanded, onOpen }: { s: RouteView["stops"][number]; expanded: boolean; onOpen: () => void }) {
  const { t } = useTranslation()
  const isDone = s.status === "DONE"
  const late = !isDone && s.windowEnd && new Date(`${new Date().toISOString().slice(0, 10)}T${s.windowEnd}`) < new Date()
  const status = isDone ? "DONE" : s.stopStatus === "PROBLEM" ? "PROBLEM" : s.stopStatus === "SKIPPED" ? "SKIPPED" : expanded ? "NEXT" : "PENDING"
  return (
    <Card size="sm" className={cn("gap-2 px-3", expanded && "ring-2 ring-primary", isDone && "opacity-70")} onClick={!expanded ? onOpen : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold tabular">{s.position}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-semibold leading-tight">
              {s.type === "PURCHASE" ? <PackageOpen className="size-4 text-muted-foreground" /> : <Truck className="size-4 text-muted-foreground" />}
              <span className="truncate">{s.party?.name}</span>
            </div>
            <div className={cn("text-sm", late ? "font-medium text-status-red" : "text-muted-foreground")}>
              {s.windowStart}–{s.windowEnd}
              {late ? " · late" : ""}
            </div>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {expanded ? (
        <>
          {s.party?.address ? (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span>
                {s.party.address}
                {s.party.landmark ? <span className="block italic">"{s.party.landmark}"</span> : null}
              </span>
            </p>
          ) : null}
          <ul className="space-y-0.5 text-base">
            {s.lines.map((l) => (
              <li key={l.id}>
                {s.type === "PURCHASE" ? "Pick up " : ""}
                <span className="font-semibold">{packs(l.quantity, l.item.packSize, l.item.unit, l.item.packName)}</span> {l.item.name}
              </li>
            ))}
          </ul>
          {s.type === "SALE_ORDER" ? (
            <div className="rounded-lg bg-muted px-3 py-2">
              <div className="text-sm text-muted-foreground">To collect</div>
              <div className="text-xl font-bold tabular">
                {formatRsShort(s.todayCents)}
                {s.oldBalanceCents ? <span className="text-base font-medium text-muted-foreground"> today + {formatRsShort(s.oldBalanceCents)} {t("driver.oldBalance")}</span> : null}
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button className="h-14 text-lg" onClick={onOpen}>
              {t("driver.arrived")} <ChevronRight className="size-5" />
            </Button>
            {s.party?.phone ? (
              <Button asChild variant="outline" className="h-14 w-14" aria-label={t("common.call")}>
                <a href={telHref(s.party.phone)}>
                  <Phone className="size-5" />
                </a>
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="truncate text-sm text-muted-foreground">
          {s.lines.map((l) => `${l.quantity} ${l.item.name}`).join(", ")}
          {s.type === "SALE_ORDER" ? ` · ${formatRsShort(s.todayCents)}` : ""}
        </p>
      )}
    </Card>
  )
}

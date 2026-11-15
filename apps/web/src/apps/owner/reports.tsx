import * as React from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { FileText } from "lucide-react"
import { api } from "@/lib/api"
import { useProfit, useStock } from "@/lib/queries"
import { cn, formatRsShort } from "@/lib/utils"
import { PhoneHeader, Screen } from "@/components/frames"
import { SyncChip, UserMenu, ListSkeleton, SectionTitle } from "@/components/common"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"

const iso = (d: Date) => d.toISOString().slice(0, 10)
const monthStart = (offset = 0) => {
  const d = new Date()
  d.setMonth(d.getMonth() + offset, 1)
  return d
}

export function OwnerReports() {
  const { t } = useTranslation()
  const [tab, setTab] = React.useState<"profit" | "sales" | "spoilage" | "credit">("profit")
  return (
    <>
      <PhoneHeader
        title={t("nav.owner.reports")}
        right={
          <div className="flex items-center gap-1">
            <SyncChip />
            <UserMenu compact />
          </div>
        }
      />
      <Screen>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="profit" className="flex-1">Profit</TabsTrigger>
            <TabsTrigger value="sales" className="flex-1">Sales</TabsTrigger>
            <TabsTrigger value="spoilage" className="flex-1">Spoilage</TabsTrigger>
            <TabsTrigger value="credit" className="flex-1">Credit</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "profit" ? <ProfitTab /> : tab === "sales" ? <SalesTab /> : tab === "spoilage" ? <SpoilageTab /> : <CreditTab />}
        <Button variant="outline" className="h-12 w-full" onClick={() => toast.info("Bank pack PDF is generated on the server in Phase 4.")}>
          <FileText className="size-5" />
          Bank pack (PDF)
        </Button>
      </Screen>
    </>
  )
}

function ProfitTab() {
  const thisMonth = useProfit(iso(monthStart()), iso(new Date()))
  const lastMonth = useProfit(iso(monthStart(-1)), iso(new Date(monthStart().getTime() - 1)))
  const stock = useStock()
  if (thisMonth.isLoading || !thisMonth.data) return <ListSkeleton />
  const p = thisMonth.data
  const lp = lastMonth.data
  const holderName = (id: string) => stock.data?.holders.find((h) => h.id === id)?.name.replace(/^Outlet \d · /, "") ?? "—"
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card size="sm" className="gap-1 px-3">
          <div className="text-xs text-muted-foreground">This month</div>
          <div className="text-xl font-semibold tabular">{formatRsShort(p.profitCents)}</div>
          <div className="text-xs text-muted-foreground">on {formatRsShort(p.revenueCents)} sales</div>
        </Card>
        <Card size="sm" className="gap-1 px-3">
          <div className="text-xs text-muted-foreground">Last month</div>
          <div className="text-xl font-semibold tabular">{lp ? formatRsShort(lp.profitCents) : "—"}</div>
          <div className="text-xs text-muted-foreground">{lp ? `on ${formatRsShort(lp.revenueCents)} sales` : ""}</div>
        </Card>
      </div>
      <SectionTitle>By outlet</SectionTitle>
      <Card className="divide-y py-0">
        {p.byOutlet.sort((a, b) => b.profit - a.profit).map((o) => (
          <Row key={o.holderId} label={holderName(o.holderId)} value={o.profit} sub={`${formatRsShort(o.revenue)} sales`} max={Math.max(...p.byOutlet.map((x) => x.profit))} />
        ))}
      </Card>
      <SectionTitle>By item</SectionTitle>
      <Card className="divide-y py-0">
        {p.byItem.sort((a, b) => b.profit - a.profit).map((it) => (
          <Row key={it.itemId} label={it.name} value={it.profit} sub={`${it.quantity.toLocaleString()} sold`} max={Math.max(...p.byItem.map((x) => x.profit))} />
        ))}
      </Card>
      <p className="text-xs text-muted-foreground">Profit = (sell − buy) × quantity, minus spoilage ({formatRsShort(p.lossCents)}). Calculated from rates and movements, never typed.</p>
    </div>
  )
}

function Row({ label, value, sub, max }: { label: string; value: number; sub?: string; max: number }) {
  const w = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate font-medium">{label}</span>
        <span className={cn("font-semibold tabular", value < 0 && "text-status-red")}>{formatRsShort(value)}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-muted">
          <div className="h-1.5 rounded-full bg-primary" style={{ width: `${w}%` }} />
        </div>
        {sub ? <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">{sub}</span> : null}
      </div>
    </div>
  )
}

function SalesTab() {
  const trend = useQuery({ queryKey: ["sales-trend"], queryFn: () => api.get<{ outlets: { id: string; name: string }[]; series: { weekStart: string; byOutlet: Record<string, number>; total: number }[] }>("/views/sales-trend") })
  if (trend.isLoading || !trend.data) return <ListSkeleton />
  const max = Math.max(1, ...trend.data.series.map((s) => s.total))
  return (
    <div className="space-y-3">
      <SectionTitle>Weekly sales · last 12 weeks</SectionTitle>
      <Card size="sm" className="px-3">
        <div className="flex h-40 items-end gap-1.5">
          {trend.data.series.map((s) => (
            <div key={s.weekStart} className="flex flex-1 flex-col items-center gap-1" title={`${formatRsShort(s.total)}`}>
              <div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(2, (s.total / max) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{new Date(trend.data.series[0]?.weekStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
          <span>this week</span>
        </div>
      </Card>
      <SectionTitle>Per outlet, this week</SectionTitle>
      <Card className="divide-y py-0">
        {trend.data.outlets.map((o) => {
          const last = trend.data!.series.at(-1)!
          return <Row key={o.id} label={o.name.replace(/^Outlet \d · /, "")} value={last.byOutlet[o.id] ?? 0} max={Math.max(...Object.values(last.byOutlet))} />
        })}
      </Card>
    </div>
  )
}

function SpoilageTab() {
  const p = useProfit(iso(monthStart()), iso(new Date()))
  const stock = useStock()
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => api.get<{ id: string; name: string }[]>("/parties?type=SUPPLIER") })
  if (p.isLoading || !p.data) return <ListSkeleton />
  const name = (id: string) => stock.data?.holders.find((h) => h.id === id)?.name ?? "—"
  const itemName = (id: string) => stock.data?.items.find((i) => i.id === id)?.name ?? "—"
  const supName = (id: string) => suppliers.data?.find((s) => s.id === id)?.name ?? "Unknown batch"
  return (
    <div className="space-y-3">
      <Card size="sm" className="gap-1 px-3">
        <div className="text-xs text-muted-foreground">Lost this month</div>
        <div className="text-xl font-semibold tabular text-status-red">{formatRsShort(p.data.lossCents)}</div>
      </Card>
      <SectionTitle>By item</SectionTitle>
      <Card className="divide-y py-0">{p.data.lossByItem.map((l) => <Row key={l.itemId} label={itemName(l.itemId)} value={l.cents} max={Math.max(...p.data!.lossByItem.map((x) => x.cents))} />)}</Card>
      <SectionTitle>By outlet</SectionTitle>
      <Card className="divide-y py-0">{p.data.lossByHolder.map((l) => <Row key={l.holderId} label={name(l.holderId)} value={l.cents} max={Math.max(...p.data!.lossByHolder.map((x) => x.cents))} />)}</Card>
      <SectionTitle>By supplier</SectionTitle>
      <Card className="divide-y py-0">{p.data.lossBySupplier.map((l) => <Row key={l.supplierId} label={supName(l.supplierId)} value={l.cents} max={Math.max(...p.data!.lossBySupplier.map((x) => x.cents))} />)}</Card>
    </div>
  )
}

function CreditTab() {
  const rec = useQuery({ queryKey: ["receivables"], queryFn: () => api.get<{ rows: { party: { id: string; name: string }; balanceCents: number; oldestDays: number; bucket: string }[]; totals: Record<string, number> }>("/views/receivables") })
  const cheques = useQuery({ queryKey: ["cheques", "PENDING"], queryFn: () => api.get<{ id: string; chequeNumber: string | null; chequeBank: string | null; chequeDate: string | null; amountCents: number; fromParty: { name: string } }[]>("/views/cheques?status=PENDING") })
  if (rec.isLoading || !rec.data) return <ListSkeleton />
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {(["0-30", "31-60", "60+"] as const).map((b, i) => (
          <Card key={b} size="sm" className="gap-0.5 px-3">
            <div className="text-xs text-muted-foreground">{b} days</div>
            <div className={cn("text-base font-semibold tabular", i === 2 && rec.data!.totals[b] > 0 && "text-status-red", i === 1 && rec.data!.totals[b] > 0 && "text-amber-700")}>{formatRsShort(rec.data!.totals[b])}</div>
          </Card>
        ))}
      </div>
      <SectionTitle>Who owes</SectionTitle>
      <Card className="divide-y py-0">
        {rec.data.rows.map((r) => (
          <div key={r.party.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
            <span>
              <span className="font-medium">{r.party.name}</span>
              <span className="block text-xs text-muted-foreground">oldest {r.oldestDays} days</span>
            </span>
            <span className={cn("font-semibold tabular", r.bucket === "60+" && "text-status-red")}>{formatRsShort(r.balanceCents)}</span>
          </div>
        ))}
      </Card>
      <SectionTitle>Cheque calendar</SectionTitle>
      <Card className="divide-y py-0">
        {(cheques.data ?? []).length === 0 ? <p className="px-3 py-3 text-sm text-muted-foreground">No cheques pending</p> : null}
        {(cheques.data ?? []).map((c) => (
          <div key={c.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
            <span>
              <span className="font-medium">{c.fromParty.name}</span>
              <span className="block text-xs text-muted-foreground">
                {c.chequeBank} #{c.chequeNumber} · {c.chequeDate ? new Date(c.chequeDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}
              </span>
            </span>
            <span className="font-semibold tabular">{formatRsShort(c.amountCents)}</span>
          </div>
        ))}
      </Card>
    </div>
  )
}

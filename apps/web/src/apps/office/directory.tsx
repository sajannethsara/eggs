import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Search, Plus, TrendingUp } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useParties, useRates } from "@/lib/queries"
import type { PriceRow } from "@/lib/types"
import { cn, formatRs, formatRsShort, formatDay } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ListSkeleton, HealthDot, ToneBadge } from "@/components/common"
import { PartyProfile } from "@/components/party-profile"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

/** Parties table, rates price list, items (spec §9.6). */
export function OfficeDirectory() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = React.useState<"parties" | "rates">("parties")
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Directory</h1>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="parties">Customers & suppliers</TabsTrigger>
            <TabsTrigger value="rates">Rates & items</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {tab === "parties" ? <Parties onOpen={(pid) => navigate(`/office/directory/${pid}`)} /> : <Rates />}
      <Sheet open={Boolean(id)} onOpenChange={(o) => !o && navigate("/office/directory")}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Profile</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">{id ? <PartyProfile id={id} canEditTerms /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Parties({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = React.useState("")
  const [type, setType] = React.useState<"CUSTOMER" | "SUPPLIER" | "EMPLOYEE">("CUSTOMER")
  const parties = useParties({ q, type })
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="w-64 pl-8" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {(["CUSTOMER", "SUPPLIER", "EMPLOYEE"] as const).map((t) => (
            <Button key={t} size="sm" variant={type === t ? "default" : "outline"} onClick={() => setType(t)}>
              {t === "CUSTOMER" ? "Customers" : t === "SUPPLIER" ? "Suppliers" : "Staff"}
            </Button>
          ))}
        </div>
      </div>
      {parties.isLoading ? (
        <ListSkeleton />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Segment / tier</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Limit · days</TableHead>
                <TableHead>Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(parties.data ?? []).map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => onOpen(p.id)}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.phone}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.segment?.replace("B2B_", "").replace("B2C_", "").toLowerCase()} · {p.contactTier.toLowerCase().replace("_", " ")}
                  </TableCell>
                  <TableCell className={cn("text-right tabular", p.health?.overdueCents ? "font-semibold text-status-red" : "")}>{p.type === "EMPLOYEE" ? "" : formatRsShort(p.balanceCents ?? 0)}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular">{p.type === "CUSTOMER" ? `${formatRsShort(p.creditLimitCents)} · ${p.creditDays}d` : ""}</TableCell>
                  <TableCell>
                    {p.health ? (
                      <span className="flex items-center gap-1.5 text-xs">
                        <HealthDot colour={p.health.colour} /> {p.creditHold ? "credit hold" : p.health.colour}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function Rates() {
  const rates = useRates()
  const [editing, setEditing] = React.useState<PriceRow | null>(null)
  if (rates.isLoading || !rates.data) return <ListSkeleton />
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Buy</TableHead>
            <TableHead className="text-right">Sell</TableHead>
            <TableHead className="text-right">Margin</TableHead>
            <TableHead>History</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rates.data.map((r) => (
            <TableRow key={r.item.id}>
              <TableCell className="font-medium">
                {r.item.name}
                <span className="ml-1 text-xs text-muted-foreground">/ {r.item.unit}</span>
              </TableCell>
              <TableCell className="text-right tabular">{formatRs(r.buyCents)}</TableCell>
              <TableCell className="text-right font-semibold tabular">{formatRs(r.sellCents)}</TableCell>
              <TableCell className="text-right">{r.marginPercent != null ? <ToneBadge tone={r.marginPercent < 10 ? "amber" : "green"}>{r.marginPercent}%</ToneBadge> : null}</TableCell>
              <TableCell>
                <Sparkline rows={r.history.filter((h) => h.direction === "SELL")} />
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                  <Plus className="size-3.5" /> New price
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <NewPriceDialog row={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function Sparkline({ rows }: { rows: { priceCents: number; validFrom: string }[] }) {
  const pts = [...rows].reverse().slice(-8)
  if (pts.length < 2) return <span className="text-xs text-muted-foreground">{pts[0] ? `since ${formatDay(pts[0].validFrom)}` : ""}</span>
  const max = Math.max(...pts.map((p) => p.priceCents))
  const min = Math.min(...pts.map((p) => p.priceCents))
  const w = 80
  const h = 20
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * w},${h - ((p.priceCents - min) / Math.max(1, max - min)) * (h - 4) - 2}`).join(" ")
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <svg width={w} height={h} aria-hidden>
        <polyline points={d} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <TrendingUp className="size-3" /> {pts.length} changes
    </span>
  )
}

function NewPriceDialog({ row, onClose }: { row: PriceRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [direction, setDirection] = React.useState<"BUY" | "SELL">("SELL")
  const [typed, setTyped] = React.useState("")
  const [from, setFrom] = React.useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  // The field shows the current price until the user types a new one.
  const price = typed || (row ? String((direction === "SELL" ? row.sellCents : row.buyCents) / 100) : "")
  const close = () => {
    setTyped("")
    setNote("")
    onClose()
  }
  const save = async () => {
    if (!row) return
    setBusy(true)
    try {
      const res = await api.post<{ request: unknown | null }>("/rates", { itemId: row.item.id, direction, priceCents: Math.round(Number(price) * 100), validFrom: from, sourceNote: note || undefined })
      toast.success(res.request ? "Over the threshold: sent to the owner" : "New price saved; old price kept in history")
      void qc.invalidateQueries({ queryKey: ["rates"] })
      void qc.invalidateQueries({ queryKey: ["items"] })
      close()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={Boolean(row)} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New price · {row?.item.name}</DialogTitle>
          <DialogDescription>Enter the price and the date it starts. Changes over the threshold go to the owner.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Direction</Label>
            <select
              className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value as "BUY" | "SELL")
                setTyped("")
              }}
            >
              <option value="SELL">Sell</option>
              <option value="BUY">Buy</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Price (Rs)</Label>
            <Input type="number" step="0.01" inputMode="decimal" value={price} onChange={(e) => setTyped(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Starts</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
        </div>
        <Textarea placeholder='Source note, e.g. "supplier call"' value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button onClick={() => void save()} disabled={busy || !price}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

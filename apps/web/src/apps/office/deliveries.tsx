import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Wand2, Send, MoveRight, Check } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useRoutePlan, useInbox, useDecide } from "@/lib/queries"
import type { RequestRow, RoutePlan } from "@/lib/types"
import { cn, formatRsShort, todayIso } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ListSkeleton, StatusBadge, ToneBadge, EmptyState } from "@/components/common"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const tomorrowIso = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Route planner, live today, breakdown handling, cash handover (spec §9.4). */
export function OfficeDeliveries() {
  const [tab, setTab] = React.useState<"plan" | "live" | "handover">("live")
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Deliveries</h1>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="live">Live today</TabsTrigger>
            <TabsTrigger value="plan">Route planner</TabsTrigger>
            <TabsTrigger value="handover">Cash handover</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {tab === "plan" ? <Planner /> : tab === "live" ? <Live /> : <Handover />}
    </div>
  )
}

function usePlanActions(day: string) {
  const qc = useQueryClient()
  const refresh = () => void qc.invalidateQueries({ queryKey: ["route-plan", day] })
  const assign = async (assignments: { requestId: string; driverId: string | null; position: number }[]) => {
    await api.post("/requests/route-plan/assign", { assignments })
    refresh()
  }
  return { assign, refresh }
}

function Planner() {
  const [day, setDay] = React.useState(tomorrowIso())
  const plan = useRoutePlan(day)
  const { assign } = usePlanActions(day)
  const [dragId, setDragId] = React.useState<string | null>(null)

  const propose = async () => {
    const res = await api.get<RoutePlan>(`/rules/route-plan?day=${day}`)
    if (!res.proposedAssignments?.length) return toast.info("Nothing to assign")
    await assign(res.proposedAssignments)
    toast.success(`Proposed ${res.proposedAssignments.length} stops; drag to change, then send`)
  }

  const dropOn = async (driverId: string | null) => {
    if (!dragId || !plan.data) return
    const target = driverId ? plan.data.drivers.find((d) => d.id === driverId) : null
    await assign([{ requestId: dragId, driverId, position: (target?.stops.length ?? 0) + 1 }])
    setDragId(null)
  }

  const move = async (r: RequestRow, dir: -1 | 1) => {
    if (!plan.data || !r.assignedToId) return
    const d = plan.data.drivers.find((x) => x.id === r.assignedToId)
    if (!d) return
    const idx = d.stops.findIndex((s) => s.id === r.id)
    const j = idx + dir
    if (j < 0 || j >= d.stops.length) return
    const order = [...d.stops]
    ;[order[idx], order[j]] = [order[j], order[idx]]
    await assign(order.map((s, i) => ({ requestId: s.id, driverId: d.id, position: i + 1 })))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-44" />
        <Button variant="outline" onClick={() => void propose()}>
          <Wand2 className="size-4" /> Propose stop order
        </Button>
        <Button onClick={() => toast.success("Drivers see their stops the moment the day starts")}>
          <Send className="size-4" /> Send to drivers
        </Button>
      </div>
      {plan.isLoading || !plan.data ? (
        <ListSkeleton />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <DropColumn title={`Approved orders (${plan.data.unassigned.length})`} onDrop={() => void dropOn(null)} active={Boolean(dragId)}>
            {plan.data.unassigned.length === 0 ? <p className="p-3 text-sm text-muted-foreground">All assigned</p> : null}
            {plan.data.unassigned.map((r) => (
              <StopCard key={r.id} r={r} onDragStart={() => setDragId(r.id)} />
            ))}
          </DropColumn>
          <div className="grid gap-3 md:grid-cols-2">
            {plan.data.drivers.map((d) => (
              <DropColumn key={d.id} title={`${d.displayName} (${d.stops.length})`} onDrop={() => void dropOn(d.id)} active={Boolean(dragId)}>
                {d.stops.map((r, i) => (
                  <StopCard key={r.id} r={r} index={i + 1} onDragStart={() => setDragId(r.id)} onUp={() => void move(r, -1)} onDown={() => void move(r, 1)} />
                ))}
              </DropColumn>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DropColumn({ title, children, onDrop, active }: { title: string; children: React.ReactNode; onDrop: () => void; active: boolean }) {
  return (
    <div
      className={cn("min-h-40 rounded-xl border bg-muted/40 p-2 transition-colors", active && "border-dashed border-primary")}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
    >
      <div className="mb-2 px-1 text-sm font-semibold">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function StopCard({ r, index, onDragStart, onUp, onDown }: { r: RequestRow; index?: number; onDragStart: () => void; onUp?: () => void; onDown?: () => void }) {
  const party = r.type === "SALE_ORDER" ? r.toParty : r.fromParty
  return (
    <div draggable onDragStart={onDragStart} className="cursor-grab rounded-lg border bg-card p-2.5 text-sm shadow-xs active:cursor-grabbing">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {index ? <span className="mr-1.5 text-muted-foreground tabular">{index}.</span> : null}
          {party?.name}
        </span>
        <span className="text-xs text-muted-foreground">{r.windowStart ? `${r.windowStart}–${r.windowEnd}` : ""}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {r.type === "PURCHASE" ? "Pickup · " : ""}
        {r.lines.map((l) => `${l.quantity} ${l.item.name}`).join(", ")}
      </p>
      {onUp ? (
        <div className="mt-1 flex gap-1">
          <Button size="xs" variant="ghost" onClick={onUp}>
            ↑
          </Button>
          <Button size="xs" variant="ghost" onClick={onDown}>
            ↓
          </Button>
          {r.status === "DONE" ? <StatusBadge status="DONE" /> : r.stopStatus === "PROBLEM" ? <StatusBadge status="PROBLEM" /> : null}
        </div>
      ) : null}
    </div>
  )
}

function Live() {
  const plan = useRoutePlan(todayIso())
  const { assign } = usePlanActions(todayIso())
  const [moveFrom, setMoveFrom] = React.useState<string | null>(null)
  const [moveTo, setMoveTo] = React.useState("")
  if (plan.isLoading || !plan.data) return <ListSkeleton />
  const from = plan.data.drivers.find((d) => d.id === moveFrom)
  const moveStops = async () => {
    if (!from || !moveTo) return
    const target = plan.data!.drivers.find((d) => d.id === moveTo)!
    const remaining = from.stops.filter((s) => s.status !== "DONE")
    await assign(remaining.map((s, i) => ({ requestId: s.id, driverId: moveTo, position: target.stops.length + i + 1 })))
    toast.success(`Moved ${remaining.length} stops to ${target.displayName}`)
    setMoveFrom(null)
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {plan.data.drivers.map((d) => {
        const problems = d.stops.filter((s) => s.stopStatus === "PROBLEM")
        return (
          <Card key={d.id} size="sm" className="gap-2 px-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{d.displayName}</div>
                <div className="text-sm text-muted-foreground">
                  {d.done} of {d.stops.length} stops · <span className="font-medium text-foreground tabular">{formatRsShort(d.collectedCents)}</span> collected
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setMoveFrom(d.id)} disabled={d.stops.length === d.done}>
                <MoveRight className="size-3.5" /> Move stops
              </Button>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-status-green" style={{ width: `${d.stops.length ? (d.done / d.stops.length) * 100 : 0}%` }} />
            </div>
            {problems.map((s) => (
              <ToneBadge key={s.id} tone="red">
                {(s.type === "SALE_ORDER" ? s.toParty : s.fromParty)?.name}: {s.stopProblem?.toLowerCase().replace("_", " ")}
              </ToneBadge>
            ))}
            <ul className="divide-y text-sm">
              {d.stops.map((s, i) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className={cn(s.status === "DONE" && "text-muted-foreground line-through")}>
                    {i + 1}. {(s.type === "SALE_ORDER" ? s.toParty : s.fromParty)?.name}
                  </span>
                  <StatusBadge status={s.status === "DONE" ? "DONE" : s.stopStatus === "PROBLEM" ? "PROBLEM" : s.status === "IN_PROGRESS" ? "IN_PROGRESS" : "PENDING"} />
                </li>
              ))}
            </ul>
          </Card>
        )
      })}
      <Dialog open={Boolean(moveFrom)} onOpenChange={(o) => !o && setMoveFrom(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {from?.displayName}'s remaining stops</DialogTitle>
            <DialogDescription>For a breakdown or reassignment. The driver sees them disappear with a message.</DialogDescription>
          </DialogHeader>
          <Select value={moveTo} onValueChange={setMoveTo}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick another driver" />
            </SelectTrigger>
            <SelectContent>
              {plan.data.drivers.filter((d) => d.id !== moveFrom).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.displayName} ({d.stops.length} stops)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button onClick={() => void moveStops()} disabled={!moveTo}>
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Count the driver's cash against what the system expects (spec §9.4). */
function Handover() {
  const inbox = useInbox("all")
  const decide = useDecide()
  const [counted, setCounted] = React.useState<Record<string, string>>({})
  const rows = (inbox.data ?? []).filter((r) => r.type === "CASH_HANDOVER")
  if (inbox.isLoading) return <ListSkeleton />
  if (rows.length === 0) return <EmptyState title="No handovers waiting" hint="When a driver taps End of day, the expected cash appears here." />
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((r) => {
        const expected = Number(r.payload?.expectedCents ?? 0)
        const actual = counted[r.id] != null ? Math.round(Number(counted[r.id]) * 100) : expected
        const diff = actual - expected
        return (
          <Card key={r.id} size="sm" className="gap-3 px-3">
            <div className="font-semibold">{r.fromParty?.name}</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Expected</div>
                <div className="text-lg font-semibold tabular">{formatRsShort(expected)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Counted (Rs)</div>
                <Input type="number" inputMode="decimal" className="h-10 text-right text-lg font-semibold tabular" value={counted[r.id] ?? expected / 100} onChange={(e) => setCounted({ ...counted, [r.id]: e.target.value })} />
              </div>
            </div>
            {diff !== 0 ? <ToneBadge tone={Math.abs(diff) > 50000 ? "red" : "amber"}>{diff > 0 ? "+" : ""}{formatRsShort(diff)} difference{Math.abs(diff) > 50000 ? " · goes to owner" : ""}</ToneBadge> : null}
            <Button className="h-11" onClick={() => decide.mutate({ id: r.id, decision: { action: "APPROVE", note: diff !== 0 ? `Counted ${formatRsShort(actual)} (${diff > 0 ? "+" : ""}${formatRsShort(diff)})` : undefined } }, { onSuccess: () => toast.success("Handover accepted"), onError: (e) => toast.error(e.message) })}>
              <Check className="size-4" /> Accept {formatRsShort(actual)}
            </Button>
          </Card>
        )
      })}
    </div>
  )
}

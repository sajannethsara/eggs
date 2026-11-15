import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { PackageCheck, Trash2, ClipboardCheck, Lock, CalendarOff, Undo2, ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { SPOILAGE_REASONS } from "shared"
import { api } from "@/lib/api"
import { useUser } from "@/lib/auth"
import { useItems, useStock } from "@/lib/queries"
import type { RequestRow } from "@/lib/types"
import { cn, formatRs, formatRsShort, uuid } from "@/lib/utils"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, ToneBadge } from "@/components/common"

type Task = "spoilage" | "receive" | "count" | "close" | "leave" | "return"

const TASKS: { key: Task; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "receive", label: "Receive transfer", hint: "Confirm goods from the warehouse", icon: PackageCheck },
  { key: "spoilage", label: "Report spoilage", hint: "Stock moves to Loss", icon: Trash2 },
  { key: "return", label: "Return / replacement", hint: "Find the bill, pick a reason", icon: Undo2 },
  { key: "count", label: "Stock check", hint: "Today's 5–10 items", icon: ClipboardCheck },
  { key: "close", label: "Day close", hint: "Count notes against expected cash", icon: Lock },
  { key: "leave", label: "My leave", hint: "Request a day off", icon: CalendarOff },
]

/** Less common cashier tasks, each a single short screen (spec §10). */
export function PosMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [task, setTask] = React.useState<Task | null>(null)
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) setTask(null)
        onOpenChange(o)
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl">
            {task ? (
              <Button variant="ghost" size="icon" onClick={() => setTask(null)} aria-label="Back">
                <ArrowLeft className="size-5" />
              </Button>
            ) : null}
            {task ? TASKS.find((t) => t.key === task)?.label : "Menu"}
          </SheetTitle>
          <SheetDescription>{task ? TASKS.find((t) => t.key === task)?.hint : "Less common tasks. Each is one short screen."}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {!task ? (
            <div className="grid grid-cols-2 gap-3">
              {TASKS.map((t) => (
                <button key={t.key} type="button" onClick={() => setTask(t.key)} className="flex min-h-28 flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left shadow-xs transition-colors hover:bg-accent">
                  <t.icon className="size-6 text-primary" />
                  <span className="font-semibold">{t.label}</span>
                  <span className="text-sm text-muted-foreground">{t.hint}</span>
                </button>
              ))}
            </div>
          ) : task === "spoilage" ? (
            <Spoilage onDone={() => onOpenChange(false)} />
          ) : task === "receive" ? (
            <Receive onDone={() => onOpenChange(false)} />
          ) : task === "close" ? (
            <DayClose onDone={() => onOpenChange(false)} />
          ) : task === "leave" ? (
            <Leave onDone={() => onOpenChange(false)} />
          ) : task === "count" ? (
            <Count onDone={() => onOpenChange(false)} />
          ) : (
            <EmptyState title="Return / replacement" hint="Find the bill by its code, tap the item, pick a reason. Coming with the receipt printer integration." />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Spoilage({ onDone }: { onDone: () => void }) {
  const user = useUser()
  const items = useItems()
  const qc = useQueryClient()
  const [itemId, setItemId] = React.useState("")
  const [qty, setQty] = React.useState("")
  const [reason, setReason] = React.useState<string>("CRACKED")
  const [busy, setBusy] = React.useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      const loss = await api.get<{ id: string }[]>("/parties?type=SYSTEM").then((ps) => (ps as unknown as { id: string; systemCode: string }[]).find((p) => p.systemCode === "LOSS"))
      await api.post("/movements", { clientId: uuid(), kind: "GOODS", fromPartyId: user.outletId, toPartyId: loss?.id, itemId, quantity: Number(qty), reason: "spoilage", spoilageReason: reason })
      toast.success("Spoilage recorded. Stock moved to Loss.")
      void qc.invalidateQueries({ queryKey: ["stock"] })
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(items.data ?? []).filter((i) => i.posOrder != null).map((i) => (
          <button key={i.id} type="button" onClick={() => setItemId(i.id)} className={cn("min-h-14 rounded-xl border px-3 text-left font-medium", itemId === i.id && "border-primary bg-primary/10")}>
            {i.name}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label>Quantity</Label>
        <Input className="h-14 text-2xl tabular" type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {SPOILAGE_REASONS.map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)} className={cn("min-h-11 rounded-full border px-4 text-sm font-medium capitalize", reason === r && "border-primary bg-primary text-primary-foreground")}>
            {r.toLowerCase()}
          </button>
        ))}
      </div>
      <Button className="h-14 w-full text-lg" disabled={!itemId || !qty || busy} onClick={() => void submit()}>
        Record spoilage
      </Button>
    </div>
  )
}

function Receive({ onDone }: { onDone: () => void }) {
  const user = useUser()
  const qc = useQueryClient()
  const incoming = useQuery({ queryKey: ["incoming", user.outletId], queryFn: () => api.get<RequestRow[]>("/requests/inbox?tab=all").then((rs) => rs.filter((r) => r.type === "TRANSFER" && r.toPartyId === user.outletId)) })
  const transfers = useQuery({
    queryKey: ["transfers-in", user.outletId],
    queryFn: async () => {
      // approved/in-progress transfers to this outlet: fetch via route-plan-free endpoint (orders board doesn't cover transfers), so use movements of kind GOODS to us pending receive.
      const all = await api.get<RequestRow[]>(`/requests/orders`).catch(() => [])
      void all
      return [] as RequestRow[]
    },
    enabled: false,
  })
  void transfers
  const [qty, setQty] = React.useState<Record<string, number>>({})
  const [busy, setBusy] = React.useState<string | null>(null)
  const pending = useQuery({ queryKey: ["pending-transfers", user.outletId], queryFn: () => api.get<RequestRow[]>(`/requests/pending-transfers?toPartyId=${user.outletId}`) })
  const list = pending.data ?? []
  const receive = async (r: RequestRow) => {
    setBusy(r.id)
    try {
      await api.post(`/movements/receive/${r.id}`, { clientId: uuid(), lines: r.lines.map((l) => ({ itemId: l.itemId, quantity: qty[`${r.id}:${l.itemId}`] ?? l.quantity })) })
      toast.success("Received. Any difference shows on both sides.")
      void qc.invalidateQueries()
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  if (pending.isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (!list.length) return <EmptyState icon={PackageCheck} title="Nothing on its way" hint={incoming.data?.length ? `${incoming.data.length} transfer(s) proposed, waiting for office approval.` : "Approved transfers from the warehouse appear here."} />
  return (
    <div className="space-y-4">
      {list.map((r) => (
        <div key={r.id} className="space-y-3 rounded-xl border p-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold">From {r.fromParty?.name}</span>
            <ToneBadge tone={r.status === "IN_PROGRESS" ? "amber" : "grey"}>{r.status === "IN_PROGRESS" ? "on its way" : "approved"}</ToneBadge>
          </div>
          {r.lines.map((l) => (
            <div key={l.id} className="grid grid-cols-[1fr_7rem] items-center gap-2">
              <span>
                {l.item.name} <span className="text-muted-foreground">expected {l.quantity}</span>
              </span>
              <Input type="number" inputMode="numeric" className="h-12 text-right text-lg tabular" value={qty[`${r.id}:${l.itemId}`] ?? l.quantity} onChange={(e) => setQty({ ...qty, [`${r.id}:${l.itemId}`]: Number(e.target.value) })} />
            </div>
          ))}
          <Button className="h-14 w-full text-lg" disabled={busy === r.id} onClick={() => void receive(r)}>
            <PackageCheck className="size-5" /> Received
          </Button>
        </div>
      ))}
    </div>
  )
}

const DENOMS = [5000, 1000, 500, 100, 50, 20]

function DayClose({ onDone }: { onDone: () => void }) {
  const user = useUser()
  const expected = useQuery({ queryKey: ["outlet-cash", user.outletId], queryFn: () => api.get<{ expectedCents: number }>(`/views/outlet-cash`) })
  const [counts, setCounts] = React.useState<Record<number, string>>({})
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const counted = DENOMS.reduce((s, d) => s + d * Number(counts[d] || 0), 0) * 100
  const exp = expected.data?.expectedCents ?? 0
  const diff = counted - exp
  const submit = async () => {
    setBusy(true)
    try {
      const office = await api.get<{ id: string; systemCode: string }[]>("/parties?type=SYSTEM").then((ps) => ps.find((p) => p.systemCode === "CASH_OFFICE"))
      if (counted > 0) await api.post("/movements", { clientId: uuid(), kind: "MONEY", fromPartyId: user.outletId, toPartyId: office?.id, amountCents: counted, method: "CASH", reason: diff === 0 ? "Day close" : `Day close: counted ${formatRsShort(counted)} vs expected ${formatRsShort(exp)}${note ? ` – ${note}` : ""}` })
      toast.success(diff === 0 ? "Day closed. Cash matches." : `Day closed with a ${formatRsShort(Math.abs(diff))} difference; the office sees it.`)
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-muted p-3">
        <div className="text-sm text-muted-foreground">Expected cash in drawer</div>
        <div className="text-2xl font-bold tabular">{formatRs(exp)}</div>
      </div>
      <div className="space-y-2">
        {DENOMS.map((d) => (
          <div key={d} className="grid grid-cols-[6rem_1fr_7rem] items-center gap-2">
            <span className="font-medium tabular">Rs {d.toLocaleString()}</span>
            <Input type="number" inputMode="numeric" className="h-12 text-right text-lg tabular" placeholder="0" value={counts[d] ?? ""} onChange={(e) => setCounts({ ...counts, [d]: e.target.value })} />
            <span className="text-right text-muted-foreground tabular">{formatRsShort(d * Number(counts[d] || 0) * 100)}</span>
          </div>
        ))}
      </div>
      <div className={cn("flex items-baseline justify-between rounded-xl px-4 py-3", diff === 0 ? "bg-status-green-soft" : "bg-status-amber-soft")}>
        <span>Counted {formatRs(counted)}</span>
        <span className="font-semibold tabular">{diff === 0 ? "matches" : `${diff > 0 ? "+" : "−"}${formatRsShort(Math.abs(diff))}`}</span>
      </div>
      {diff !== 0 ? <Textarea placeholder="Note about the difference" value={note} onChange={(e) => setNote(e.target.value)} /> : null}
      <Button className="h-14 w-full text-lg" disabled={busy || counted === 0} onClick={() => void submit()}>
        <Lock className="size-5" /> Close day · print summary
      </Button>
    </div>
  )
}

function Leave({ onDone }: { onDone: () => void }) {
  const user = useUser()
  const [date, setDate] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const mine = useQuery({ queryKey: ["my-leave"], queryFn: () => api.get<RequestRow[]>("/requests/inbox?tab=all").then((rs) => rs.filter((r) => r.type === "LEAVE" && r.fromPartyId === user.partyId)) })
  const submit = async () => {
    setBusy(true)
    try {
      await api.post("/requests", { type: "LEAVE", fromPartyId: user.partyId, dueAt: date, reason: `${user.displayName} requests ${new Date(date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })} off${reason ? `: ${reason}` : ""}`, lines: [] })
      toast.success("Leave requested")
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Day off</Label>
        <Input type="date" className="h-12 text-base" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <Textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button className="h-14 w-full text-lg" disabled={!date || busy} onClick={() => void submit()}>
        Request leave
      </Button>
      {mine.data?.length ? (
        <div className="space-y-1 text-sm">
          <div className="font-medium">Waiting for approval</div>
          {mine.data.map((r) => (
            <div key={r.id} className="text-muted-foreground">
              {r.dueAt ? new Date(r.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""} · waiting
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Count({ onDone }: { onDone: () => void }) {
  const user = useUser()
  const stock = useStock()
  const [counts, setCounts] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const cells = (stock.data?.cells ?? []).filter((c) => c.holderId === user.outletId && c.quantity !== 0)
  // 5–10 items a day: rotate by day of month.
  const today = new Date().getDate()
  const list = cells.filter((_, i) => (i + today) % 2 === 0).slice(0, 8)
  const submit = async () => {
    setBusy(true)
    try {
      const diffs = list.map((c) => ({ c, counted: Number(counts[c.itemId] ?? NaN) })).filter((x) => !Number.isNaN(x.counted) && x.counted !== x.c.quantity)
      if (diffs.length) {
        const loss = await api.get<{ id: string; systemCode: string }[]>("/parties?type=SYSTEM").then((ps) => ps.find((p) => p.systemCode === "LOSS"))
        for (const d of diffs) {
          const short = d.c.quantity - d.counted
          await api.post("/requests", { type: "STOCK_ADJUSTMENT", fromPartyId: short > 0 ? user.outletId : loss?.id, toPartyId: short > 0 ? loss?.id : user.outletId, lines: [{ itemId: d.c.itemId, quantity: Math.abs(short) }], reason: `Stock check at ${user.displayName}'s outlet: system ${d.c.quantity}, counted ${d.counted}.` })
        }
        toast.success(`${diffs.length} difference(s) sent to the office`)
      } else toast.success("Count matches")
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const name = (id: string) => stock.data?.items.find((i) => i.id === id)?.name ?? ""
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Count these {list.length} items. The expected number is hidden until you enter a count.</p>
      {list.map((c) => (
        <div key={c.itemId} className="grid grid-cols-[1fr_8rem] items-center gap-2">
          <span className="font-medium">
            {name(c.itemId)}
            {counts[c.itemId] ? <span className="ml-2 text-sm text-muted-foreground">system {c.quantity}</span> : null}
          </span>
          <Input type="number" inputMode="numeric" className="h-12 text-right text-lg tabular" value={counts[c.itemId] ?? ""} onChange={(e) => setCounts({ ...counts, [c.itemId]: e.target.value })} />
        </div>
      ))}
      <Button className="h-14 w-full text-lg" disabled={busy} onClick={() => void submit()}>
        <ClipboardCheck className="size-5" /> Save count
      </Button>
    </div>
  )
}

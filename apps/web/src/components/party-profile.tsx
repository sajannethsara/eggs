import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Lock, Pencil, ShieldOff } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useParty, keys } from "@/lib/queries"
import type { Movement, RequestRow } from "@/lib/types"
import { cn, formatDay, formatRsShort, formatTime } from "@/lib/utils"
import { ContactButtons, HealthDot, ListSkeleton, ToneBadge, TypeBadge, StatusBadge } from "@/components/common"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

type Note = { id: string; channel: string; text: string; createdAt: string; createdBy: { displayName: string } }

/** Header + health signals + single timeline (spec §6, §8.4). Shared by owner and office. */
export function PartyProfile({ id, canEditTerms = false }: { id: string; canEditTerms?: boolean }) {
  const party = useParty(id)
  const qc = useQueryClient()
  const [editing, setEditing] = React.useState(false)
  if (party.isLoading || !party.data) return <ListSkeleton />
  const p = party.data
  const h = p.health

  const signal = (label: string, s: "ok" | "slipped" | "na" | undefined, detail: string) => (
    <div className="rounded-lg border px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <HealthDot colour={s === "slipped" ? "red" : s === "ok" ? "green" : "amber"} className={s === "na" ? "bg-muted-foreground/40" : ""} />
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium">{detail}</div>
    </div>
  )

  return (
    <div className="space-y-4">
      <Card size="sm" className="gap-3 px-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-lg font-semibold">
              {p.contactTier === "OWNER_ONLY" ? <Lock className="size-4 text-muted-foreground" /> : null}
              <span className="truncate">{p.name}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <ToneBadge tone="grey">{p.type === "SUPPLIER" ? "Supplier" : p.segment === "B2B_BIG" ? "Big customer" : p.segment === "B2B_REGULAR" ? "Regular" : "Walk-in"}</ToneBadge>
              <ToneBadge tone="grey">{p.contactTier === "OWNER_ONLY" ? "Owner-only" : p.contactTier === "CAN_DELEGATE" ? "Can delegate" : "Staff"}</ToneBadge>
              {p.creditHold ? <ToneBadge tone="red">Credit on hold</ToneBadge> : null}
              {h ? <ToneBadge tone={h.colour}>{h.colour === "green" ? "Healthy" : h.colour === "amber" ? "Needs attention" : "Red"}</ToneBadge> : null}
            </div>
            {p.address ? <p className="mt-1 text-sm text-muted-foreground">{p.address}{p.landmark ? ` · ${p.landmark}` : ""}</p> : null}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">{p.type === "SUPPLIER" ? "We owe" : "Balance"}</div>
            <div className={cn("text-lg font-semibold tabular", h?.overdueCents ? "text-status-red" : "")}>{formatRsShort(p.balanceCents ?? 0)}</div>
            {p.type === "CUSTOMER" ? <div className="text-xs text-muted-foreground">limit {formatRsShort(p.creditLimitCents)} · {p.creditDays}d</div> : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <ContactButtons phone={p.phone} whatsapp={p.whatsapp} size="default" />
          {canEditTerms ? (
            <Button variant="outline" size="default" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              Terms
            </Button>
          ) : null}
        </div>
      </Card>

      {h ? (
        <div className="grid grid-cols-2 gap-2">
          {signal("Order rhythm", h.orderRhythm, h.daysSinceOrder == null ? "No orders yet" : `${h.daysSinceOrder} days since last`)}
          {signal("Payment", h.payment, h.overdueCents ? `${formatRsShort(h.overdueCents)} overdue` : (p.balanceCents ?? 0) > 0 ? "Within terms" : "Nothing owed")}
          {signal("Complaints", h.complaints, `${h.returns90d} return${h.returns90d === 1 ? "" : "s"} in 90 days`)}
          {signal("Last contact", h.lastContact, h.daysSinceContact == null ? "Never" : `${h.daysSinceContact} days ago`)}
        </div>
      ) : null}

      {p.usualDays.length ? (
        <p className="text-sm text-muted-foreground">
          Usual day{p.usualDays.length > 1 ? "s" : ""}: {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].filter((_, i) => p.usualDays.includes(i)).join(" / ")}
          {p.windowStart ? ` · ${p.windowStart}–${p.windowEnd}` : ""}
          {p.routeName ? ` · ${p.routeName} route` : ""}
        </p>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h3>
        <Card className="divide-y py-0">
          {p.timeline.length === 0 ? <p className="px-3 py-4 text-sm text-muted-foreground">No activity yet</p> : null}
          {p.timeline.map((e, i) => (
            <TimelineRow key={i} e={e} />
          ))}
        </Card>
      </section>

      <TermsDialog
        open={editing}
        onOpenChange={setEditing}
        party={p}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: keys.party(id) })
          void qc.invalidateQueries({ queryKey: ["parties"] })
        }}
      />
    </div>
  )
}

function TimelineRow({ e }: { e: { kind: "note" | "request" | "movement"; at: string; data: never } }) {
  const when = `${formatDay(e.at)} ${formatTime(e.at)}`
  if (e.kind === "note") {
    const n = e.data as Note
    return (
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="capitalize">{n.channel.toLowerCase()} · {n.createdBy?.displayName}</span>
          <span className="tabular">{when}</span>
        </div>
        <p className="mt-0.5 text-sm">{n.text}</p>
      </div>
    )
  }
  if (e.kind === "request") {
    const r = e.data as RequestRow
    const value = r.lines.reduce((s, l) => s + l.quantity * l.rateCents, 0)
    return (
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <TypeBadge type={r.type} />
            <StatusBadge status={r.status} />
          </div>
          <span className="text-xs text-muted-foreground tabular">{when}</span>
        </div>
        <p className="mt-1 text-sm">
          {r.lines.map((l) => `${l.quantity} ${l.item.name}`).join(", ") || r.reason}
          {value ? <span className="text-muted-foreground"> · {formatRsShort(value)}</span> : null}
        </p>
      </div>
    )
  }
  const m = e.data as Movement
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
      <span>
        {m.kind === "MONEY" ? (
          <>
            <span className="font-medium">{formatRsShort(m.amountCents ?? 0)}</span> {m.method?.toLowerCase().replace("_", " ")}
            {m.chequeStatus ? ` (${m.chequeStatus.toLowerCase()})` : ""}
          </>
        ) : (
          <>
            {m.quantity} {m.item?.name} {m.signerName ? "· signed" : ""}
          </>
        )}
      </span>
      <span className="text-xs text-muted-foreground tabular">{when}</span>
    </div>
  )
}

/** Change tier, credit limit, or hold credit; each change goes through the review gate when it's not the owner. */
function TermsDialog({ open, onOpenChange, party, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; party: { id: string; contactTier: string; creditLimitCents: number; creditDays: number; creditHold: boolean }; onSaved: () => void }) {
  const [tier, setTier] = React.useState(party.contactTier)
  const [limit, setLimit] = React.useState(String(party.creditLimitCents / 100))
  const [days, setDays] = React.useState(String(party.creditDays))
  const [hold, setHold] = React.useState(party.creditHold)
  const [busy, setBusy] = React.useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await api.patch(`/parties/${party.id}`, { contactTier: tier, creditLimitCents: Math.round(Number(limit) * 100), creditDays: Number(days), creditHold: hold })
      toast.success("Saved and logged")
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terms</DialogTitle>
          <DialogDescription>Every change is logged with who and when.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Contact tier</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OWNER_ONLY">Owner-only</SelectItem>
                <SelectItem value="CAN_DELEGATE">Can delegate</SelectItem>
                <SelectItem value="STAFF">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="limit">Credit limit (Rs)</Label>
              <Input id="limit" type="number" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="days">Credit days</Label>
              <Input id="days" type="number" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <ShieldOff className="size-4 text-status-red" /> Hold credit
            </span>
            <Switch checked={hold} onCheckedChange={setHold} />
          </label>
        </div>
        <DialogFooter>
          <Button onClick={() => void save()} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

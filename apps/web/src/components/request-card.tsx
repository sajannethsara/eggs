import * as React from "react"
import { useTranslation } from "react-i18next"
import { Check, X, Pencil, ArrowUpRight, Bot, User as UserIcon } from "lucide-react"
import { toast } from "sonner"
import { REJECT_REASONS, type RejectReason, type RequestDecision } from "shared"
import type { RequestRow } from "@/lib/types"
import { useDecide } from "@/lib/queries"
import { cn, formatDay, formatRsShort, packs } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { TypeBadge, StatusBadge } from "@/components/common"

export const REASON_LABELS: Record<RejectReason, string> = {
  NOT_NEEDED: "Not needed",
  WRONG_QUANTITY: "Wrong quantity",
  WRONG_PRICE: "Wrong price",
  DUPLICATE: "Duplicate",
  CUSTOMER_CANCELLED: "Customer cancelled",
  OTHER: "Other",
}

export function requestTitle(r: RequestRow): string {
  const party = r.toParty?.name ?? r.fromParty?.name ?? ""
  const payload = r.payload ?? {}
  switch (r.type) {
    case "SALE_ORDER":
      return `Order for ${party}`
    case "PURCHASE":
      return `Buy from ${r.fromParty?.name ?? ""}`
    case "TRANSFER":
      return `${r.fromParty?.name ?? ""} → ${r.toParty?.name ?? ""}`
    case "PRICE_CHANGE":
      return `${payload.direction === "BUY" ? "Buy" : "Sell"} price → ${formatRsShort(Number(payload.priceCents ?? 0))}`
    case "CREDIT_LIMIT_CHANGE":
      return `${party}: limit → ${formatRsShort(Number(payload.creditLimitCents ?? 0))}`
    case "CALL_TASK":
      return `Call ${party}`
    case "COLLECTION":
      return `Collect from ${r.fromParty?.name ?? party}`
    case "LEAVE":
      return `Leave: ${r.fromParty?.name ?? ""} ${r.dueAt ? formatDay(r.dueAt) : ""}`
    case "CASH_HANDOVER":
      return `Handover: ${r.fromParty?.name ?? ""}`
    case "RETURN":
      return `Return from ${r.fromParty?.name ?? ""}`
    default:
      return party
  }
}

export function requestValue(r: RequestRow): number {
  if (r.valueCents) return r.valueCents
  const lines = r.lines.reduce((s, l) => s + l.quantity * l.rateCents, 0)
  if (lines) return lines
  const p = r.payload ?? {}
  return Number(p.expectedCents ?? p.creditLimitCents ?? 0)
}

export function LinesSummary({ r, className }: { r: RequestRow; className?: string }) {
  if (!r.lines.length) return null
  return (
    <ul className={cn("space-y-0.5 text-sm", className)}>
      {r.lines.map((l) => (
        <li key={l.id} className="flex justify-between gap-2">
          <span>
            {packs(l.quantity, l.item.packSize, l.item.unit, l.item.packName)} {l.item.name}
          </span>
          <span className="text-muted-foreground tabular">{formatRsShort(l.quantity * l.rateCents)}</span>
        </li>
      ))}
    </ul>
  )
}

/** A proposal card with Approve / Edit / Reject (spec §5, §8.2, §9.2). */
export function RequestCard({
  r,
  compact = false,
  onOpen,
  canSendToOwner = false,
  selected = false,
}: {
  r: RequestRow
  compact?: boolean
  onOpen?: () => void
  canSendToOwner?: boolean
  selected?: boolean
}) {
  const { t } = useTranslation()
  const decide = useDecide()
  const [rejecting, setRejecting] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const value = requestValue(r)

  const run = (decision: RequestDecision, okMsg: string) =>
    decide.mutate(
      { id: r.id, decision },
      {
        onSuccess: () => toast.success(okMsg),
        onError: (e) => toast.error(e.message),
      }
    )

  return (
    <Card size="sm" className={cn("gap-2 px-3", selected && "ring-2 ring-primary", onOpen && "cursor-pointer")} onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <TypeBadge type={r.type} />
            {r.escalated ? <StatusBadge status="PROPOSED" /> : null}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {r.createdByRule ? <Bot className="size-3" /> : <UserIcon className="size-3" />}
              {r.createdByRule ? r.createdByRule.toLowerCase().replace(/_/g, " ") : r.createdBy?.displayName}
            </span>
          </div>
          <div className="mt-1 font-semibold leading-snug">{requestTitle(r)}</div>
        </div>
        {value > 0 ? <div className="shrink-0 text-right text-base font-semibold tabular">{formatRsShort(value)}</div> : null}
      </div>
      {r.reason ? <p className="text-sm leading-snug text-muted-foreground">{r.reason}</p> : null}
      {!compact ? <LinesSummary r={r} /> : null}
      {r.dueAt ? (
        <p className="text-xs text-muted-foreground">
          Due {formatDay(r.dueAt)}
          {r.windowStart ? ` · ${r.windowStart}–${r.windowEnd}` : ""}
          {r.assignedTo ? ` · ${r.assignedTo.displayName}` : ""}
        </p>
      ) : null}
      <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
        <Button className="h-11 flex-1" onClick={() => run({ action: "APPROVE" }, "Approved")} disabled={decide.isPending}>
          <Check className="size-4" />
          {t("common.approve")}
        </Button>
        {r.lines.length > 0 ? (
          <Button variant="outline" className="h-11" onClick={() => setEditing(true)} disabled={decide.isPending} aria-label={t("common.edit")}>
            <Pencil className="size-4" />
          </Button>
        ) : null}
        {canSendToOwner && !r.escalated ? (
          <Button variant="outline" className="h-11" onClick={() => run({ action: "SEND_TO_OWNER" }, "Sent to owner")} disabled={decide.isPending} aria-label="Send to owner">
            <ArrowUpRight className="size-4" />
          </Button>
        ) : null}
        <Button variant="destructive" className="h-11" onClick={() => setRejecting(true)} disabled={decide.isPending} aria-label={t("common.reject")}>
          <X className="size-4" />
        </Button>
      </div>

      <RejectDialog open={rejecting} onOpenChange={setRejecting} onConfirm={(reason, note) => run({ action: "REJECT", rejectReason: reason, note }, "Rejected")} />
      <EditLinesDialog r={r} open={editing} onOpenChange={setEditing} onConfirm={(lines) => run({ action: "EDIT_APPROVE", lines }, "Edited and approved")} />
    </Card>
  )
}

export function RejectDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (reason: RejectReason, note?: string) => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = React.useState<RejectReason>("NOT_NEEDED")
  const [note, setNote] = React.useState("")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("common.reject")}</DialogTitle>
          <DialogDescription>Pick a reason. It is counted against the rule so it can be tuned.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={(v) => setReason(v as RejectReason)} className="gap-2">
          {REJECT_REASONS.map((r) => (
            <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/10">
              <RadioGroupItem value={r} />
              <span>{REASON_LABELS[r]}</span>
            </label>
          ))}
        </RadioGroup>
        <Textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm(reason, note || undefined)
              onOpenChange(false)
            }}
          >
            {t("common.reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function EditLinesDialog({ r, open, onOpenChange, onConfirm }: { r: RequestRow; open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (lines: { itemId: string; quantity: number; rateCents: number }[]) => void }) {
  const { t } = useTranslation()
  // Empty until edited; each field falls back to the request's quantity.
  const [qty, setQty] = React.useState<Record<string, number>>({})
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setQty({})
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit then approve</DialogTitle>
          <DialogDescription>Change the quantities, then approve. The original is kept in the history.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {r.lines.map((l) => (
            <div key={l.id} className="grid grid-cols-[1fr_7rem] items-center gap-3">
              <Label htmlFor={`q-${l.id}`}>
                {l.item.name} <span className="text-muted-foreground">({l.item.unit}s)</span>
              </Label>
              <Input id={`q-${l.id}`} type="number" inputMode="numeric" min={0} className="h-11 text-right text-base tabular" value={qty[l.itemId] ?? l.quantity} onChange={(e) => setQty({ ...qty, [l.itemId]: Number(e.target.value) })} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => {
              onConfirm(r.lines.filter((l) => (qty[l.itemId] ?? l.quantity) > 0).map((l) => ({ itemId: l.itemId, quantity: qty[l.itemId] ?? l.quantity, rateCents: l.rateCents })))
              onOpenChange(false)
            }}
          >
            <Check className="size-4" />
            {t("common.approve")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

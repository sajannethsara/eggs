import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Repeat, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useOrders, useDecide } from "@/lib/queries"
import type { RequestRow } from "@/lib/types"
import { cn, formatRsShort, todayIso } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ListSkeleton, ToneBadge } from "@/components/common"

const COLUMNS = [
  { key: "new", label: "New", match: (r: RequestRow) => r.status === "PROPOSED" },
  { key: "confirmed", label: "Confirmed", match: (r: RequestRow) => r.status === "APPROVED" && !r.movements?.length },
  { key: "out", label: "Out", match: (r: RequestRow) => r.status === "IN_PROGRESS" },
  { key: "delivered", label: "Delivered", match: (r: RequestRow) => r.status === "DONE" && (r.paidCents ?? 0) < (r.valueCents ?? 0) },
  { key: "paid", label: "Paid", match: (r: RequestRow) => r.status === "DONE" && (r.paidCents ?? 0) >= (r.valueCents ?? 0) },
] as const

/** Orders board (spec §9.3). */
export function OfficeOrders() {
  const [day, setDay] = React.useState(todayIso())
  const orders = useOrders(day)
  const decide = useDecide()
  const qc = useQueryClient()
  const rows = (orders.data ?? []).filter((r) => r.reason !== "Walk-in sale")

  const repeat = async (r: RequestRow) => {
    const d = new Date(day)
    d.setDate(d.getDate() + 1)
    await api.post("/requests", { type: "SALE_ORDER", toPartyId: r.toPartyId, fromPartyId: r.fromPartyId, lines: r.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })), dueAt: d.toISOString().slice(0, 10), windowStart: r.windowStart ?? undefined, windowEnd: r.windowEnd ?? undefined, reason: "Order again" })
    toast.success(`Order again for ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`)
    void qc.invalidateQueries({ queryKey: ["orders"] })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Orders</h1>
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-44" />
      </div>
      {orders.isLoading ? (
        <ListSkeleton />
      ) : (
        <div className="grid gap-3 md:grid-cols-5">
          {COLUMNS.map((c) => {
            const items = rows.filter(c.match)
            return (
              <div key={c.key} className="rounded-xl border bg-muted/40 p-2">
                <div className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
                  {c.label} <span className="text-muted-foreground tabular">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((r) => {
                    const late = r.status !== "DONE" && r.windowEnd && new Date(`${day}T${r.windowEnd}`) < new Date()
                    const minutesLate = late ? Math.round((Date.now() - new Date(`${day}T${r.windowEnd}`).getTime()) / 60_000) : 0
                    return (
                      <div key={r.id} className={cn("rounded-lg border bg-card p-2.5 text-sm shadow-xs", late && "border-status-red/50")}>
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-medium leading-snug">{r.toParty?.name}</span>
                          <span className="shrink-0 font-semibold tabular">{formatRsShort(r.valueCents ?? 0)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{r.lines.map((l) => `${l.quantity} ${l.item.name}`).join(", ")}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
                          {r.windowStart ? <span className="text-muted-foreground">{r.windowStart}–{r.windowEnd}</span> : null}
                          {late ? <ToneBadge tone="red">{minutesLate} min late</ToneBadge> : null}
                          {r.creditWarning ? (
                            <ToneBadge tone="amber">
                              <AlertTriangle className="size-3" /> credit
                            </ToneBadge>
                          ) : null}
                          {r.assignedTo ? <span className="text-muted-foreground">· {r.assignedTo.displayName}</span> : null}
                        </div>
                        <div className="mt-2 flex gap-1">
                          {c.key === "new" ? (
                            <Button size="xs" onClick={() => decide.mutate({ id: r.id, decision: { action: "APPROVE" } }, { onSuccess: () => toast.success("Confirmed") })}>
                              Confirm
                            </Button>
                          ) : null}
                          {c.key === "delivered" || c.key === "paid" ? (
                            <Button size="xs" variant="ghost" onClick={() => void repeat(r)}>
                              <Repeat className="size-3" /> Order again
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

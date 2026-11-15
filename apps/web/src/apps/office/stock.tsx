import * as React from "react"
import { useStock, useInbox, useMovements } from "@/lib/queries"
import type { StockCell } from "@/lib/types"
import { cn, formatDay, formatTime, packs } from "@/lib/utils"
import { ListSkeleton, ToneBadge } from "@/components/common"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { RequestCard } from "@/components/request-card"

/** Grid of items × holders with freshness colour (spec §9.5). */
export function OfficeStock() {
  const stock = useStock()
  const inbox = useInbox("all")
  const [open, setOpen] = React.useState<StockCell | null>(null)
  const proposals = (inbox.data ?? []).filter((r) => r.type === "TRANSFER" || r.type === "PURCHASE")
  if (stock.isLoading || !stock.data) return <ListSkeleton />
  const { holders, items, cells } = stock.data
  const cell = (h: string, i: string) => cells.find((c) => c.holderId === h && c.itemId === i)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Stock</h1>
        <div className="flex gap-2 text-xs">
          <ToneBadge tone="green">fresh</ToneBadge>
          <ToneBadge tone="amber">aging</ToneBadge>
          <ToneBadge tone="red">over holding period / low</ToneBadge>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="sticky left-0 bg-muted/50 px-3 py-2 font-medium">Item</th>
              {holders.map((h) => (
                <th key={h.id} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  {h.name.replace(/^Outlet \d · /, "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b last:border-0">
                <td className="sticky left-0 bg-card px-3 py-1.5 font-medium whitespace-nowrap">
                  {it.name}
                  {it.perishable ? <span className="ml-1 text-xs text-muted-foreground">{it.holdingDays}d</span> : null}
                </td>
                {holders.map((h) => {
                  const c = cell(h.id, it.id)
                  const qty = c?.quantity ?? 0
                  const tone = c?.belowReorder ? "red" : c?.freshness ?? (qty > 0 ? "none" : "empty")
                  return (
                    <td key={h.id} className="px-1 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => c && setOpen(c)}
                        className={cn(
                          "w-full rounded-md px-2 py-1 text-right tabular transition-colors hover:ring-2 hover:ring-primary/40",
                          tone === "green" && "bg-status-green-soft text-green-900 dark:text-status-green",
                          tone === "amber" && "bg-status-amber-soft text-amber-900 dark:text-status-amber",
                          tone === "red" && "bg-status-red-soft font-semibold text-red-900 dark:text-status-red",
                          tone === "empty" && "text-muted-foreground/50"
                        )}
                        title={c?.agePercent != null ? `${c.agePercent}% of holding period` : undefined}
                      >
                        {qty.toLocaleString()}
                        {c?.belowReorder ? <span className="ml-1 text-[10px]">↓{c.reorderLevel}</span> : null}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {proposals.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Proposed transfers and purchases</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {proposals.map((r) => (
              <RequestCard key={r.id} r={r} compact />
            ))}
          </div>
        </section>
      ) : null}

      <CellSheet cell={open} onClose={() => setOpen(null)} holderName={open ? holders.find((h) => h.id === open.holderId)?.name ?? "" : ""} item={open ? items.find((i) => i.id === open.itemId) : undefined} />
    </div>
  )
}

function CellSheet({ cell, onClose, holderName, item }: { cell: StockCell | null; onClose: () => void; holderName: string; item?: { name: string; packSize: number; unit: string; packName: string | null } }) {
  const movements = useMovements({ partyId: cell?.holderId, kind: "GOODS", limit: 60 })
  const rows = (movements.data ?? []).filter((m) => m.itemId === cell?.itemId)
  return (
    <Sheet open={Boolean(cell)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {item?.name} at {holderName.replace(/^Outlet \d · /, "")}
          </SheetTitle>
          <SheetDescription>
            {cell && item ? packs(cell.quantity, item.packSize, item.unit, item.packName) : ""}
            {cell?.oldestBatchAt ? ` · oldest batch ${formatDay(cell.oldestBatchAt)} (${cell.agePercent}% of holding period)` : ""}
          </SheetDescription>
        </SheetHeader>
        <ul className="divide-y px-4 text-sm">
          {rows.map((m) => {
            const inn = m.toPartyId === cell?.holderId
            return (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <span className={cn("font-semibold tabular", inn ? "text-status-green" : "text-status-red")}>
                    {inn ? "+" : "−"}
                    {m.quantity}
                  </span>{" "}
                  {inn ? `from ${m.fromParty?.name}` : `to ${m.toParty?.name}`}
                  {m.reason ? <span className="text-muted-foreground"> · {m.reason}</span> : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular">
                  {formatDay(m.occurredAt)} {formatTime(m.occurredAt)}
                </span>
              </li>
            )
          })}
        </ul>
      </SheetContent>
    </Sheet>
  )
}

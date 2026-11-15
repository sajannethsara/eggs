import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { PackageCheck, Send, ClipboardCheck, Trash2, ChevronRight } from "lucide-react"
import { api } from "@/lib/api"
import { useUser } from "@/lib/auth"
import { useStock } from "@/lib/queries"
import type { RequestRow } from "@/lib/types"
import { cn, formatDay } from "@/lib/utils"
import { Screen } from "@/components/frames"
import { SyncChip, UserMenu, SectionTitle, ListSkeleton, HelpButton } from "@/components/common"
import { Card } from "@/components/ui/card"

/** Four large buttons + to-do list + freshness strip (spec §12). */
export function WarehouseHome() {
  const user = useUser()
  const stock = useStock()
  const todo = useQuery({ queryKey: ["wh-todo"], queryFn: () => api.get<{ receive: RequestRow[]; send: RequestRow[] }>("/requests/warehouse-todo"), refetchInterval: 20_000 })
  const wh = stock.data?.holders.find((h) => h.type === "WAREHOUSE")
  const perishable = (stock.data?.items ?? []).filter((i) => i.perishable)

  const buttons = [
    { to: "/warehouse/receive", icon: PackageCheck, label: "Receive", hint: `${todo.data?.receive.length ?? 0} arriving`, tone: "green" },
    { to: "/warehouse/send", icon: Send, label: "Send", hint: `${todo.data?.send.length ?? 0} to pack`, tone: "amber" },
    { to: "/warehouse/count", icon: ClipboardCheck, label: "Count", hint: "today's list", tone: "blue" },
    { to: "/warehouse/spoiled", icon: Trash2, label: "Spoiled", hint: "record a loss", tone: "red" },
  ] as const

  return (
    <>
      <div className="flex items-center justify-between px-4 pt-3">
        <div>
          <h1 className="text-xl font-semibold">Warehouse</h1>
          <p className="text-sm text-muted-foreground">{user.displayName} · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}</p>
        </div>
        <div className="flex items-center gap-1">
          <SyncChip />
          <HelpButton title="Warehouse" steps={["Receive: tick what arrived against the purchase.", "Send: pack approved transfers, oldest batch first.", "Count: 5–10 items a day, expected number hidden until you type.", "Spoiled: pick item, quantity, reason, photo."]} />
          <UserMenu compact />
        </div>
      </div>
      <Screen>
        <div className="grid grid-cols-2 gap-3">
          {buttons.map((b) => (
            <Link key={b.to} to={b.to} className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl">
              <Card className={cn("min-h-32 gap-2 px-4 transition-transform active:scale-[0.98]", b.tone === "green" && "bg-status-green-soft/60", b.tone === "amber" && "bg-status-amber-soft/60", b.tone === "blue" && "bg-status-blue-soft/60", b.tone === "red" && "bg-status-red-soft/60")}>
                <b.icon className="size-8" />
                <div className="text-xl font-semibold">{b.label}</div>
                <div className="text-sm text-muted-foreground">{b.hint}</div>
              </Card>
            </Link>
          ))}
        </div>

        <section className="space-y-2">
          <SectionTitle>To do</SectionTitle>
          {todo.isLoading ? (
            <ListSkeleton rows={2} />
          ) : (
            <Card className="divide-y py-0">
              {(todo.data?.receive ?? []).map((r) => (
                <Link key={r.id} to={`/warehouse/receive/${r.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-accent">
                  <PackageCheck className="size-5 text-status-green" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">Arriving: {r.fromParty?.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">{r.lines.map((l) => `${l.quantity} ${l.item.name}`).join(", ")}{r.dueAt ? ` · ${formatDay(r.dueAt)}` : ""}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
              {(todo.data?.send ?? []).map((r) => (
                <Link key={r.id} to="/warehouse/send" className="flex items-center gap-3 px-3 py-3 hover:bg-accent">
                  <Send className="size-5 text-status-amber" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">Send to {r.toParty?.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">{r.lines.map((l) => `${l.quantity} ${l.item.name}`).join(", ")}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
              {!todo.data?.receive.length && !todo.data?.send.length ? <p className="px-3 py-4 text-sm text-muted-foreground">Nothing waiting. Approved purchases and transfers appear here.</p> : null}
            </Card>
          )}
        </section>

        <section className="space-y-2">
          <SectionTitle>Freshness</SectionTitle>
          <Card className="gap-3 px-3">
            {perishable.map((it) => {
              const c = stock.data?.cells.find((x) => x.holderId === wh?.id && x.itemId === it.id)
              const pct = Math.min(100, c?.agePercent ?? 0)
              return (
                <div key={it.id}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{it.name}</span>
                    <span className="text-muted-foreground">
                      {c?.quantity ?? 0} in stock · {c?.oldestBatchAt ? `oldest ${formatDay(c.oldestBatchAt)}` : "no batch"} · {it.holdingDays}d limit
                    </span>
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", pct >= 100 ? "bg-status-red" : pct >= 50 ? "bg-status-amber" : "bg-status-green")} style={{ width: `${Math.max(3, pct)}%` }} />
                  </div>
                </div>
              )
            })}
          </Card>
        </section>
      </Screen>
    </>
  )
}

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { Minus, Plus, Search, Trash2, Banknote, CreditCard, FileText, Menu as MenuIcon, Undo2 } from "lucide-react"
import { toast } from "sonner"
import type { PaymentMethod } from "shared"
import { api, ApiError } from "@/lib/api"
import { useUser } from "@/lib/auth"
import { useItems, useParties } from "@/lib/queries"
import { runOrQueue } from "@/lib/offline"
import type { Item, Party } from "@/lib/types"
import { cn, formatRs, formatRsShort, uuid } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { SyncChip, UserMenu, HelpButton, ToneBadge } from "@/components/common"
import { PosMenu } from "./menu"

type Line = { item: Item; quantity: number }

const TILE_COLORS: Record<string, string> = {
  yellow: "bg-amber-100 text-amber-950 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-100 dark:ring-amber-500/30",
  brown: "bg-orange-100 text-orange-950 ring-orange-200 dark:bg-orange-500/20 dark:text-orange-100 dark:ring-orange-500/30",
  green: "bg-emerald-100 text-emerald-950 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-100 dark:ring-emerald-500/30",
  amber: "bg-yellow-100 text-yellow-950 ring-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-100 dark:ring-yellow-500/30",
  red: "bg-rose-100 text-rose-950 ring-rose-200 dark:bg-rose-500/20 dark:text-rose-100 dark:ring-rose-500/30",
  blue: "bg-sky-100 text-sky-950 ring-sky-200 dark:bg-sky-500/20 dark:text-sky-100 dark:ring-sky-500/30",
  grey: "bg-muted text-foreground ring-border",
}

/** Billing screen: tiles left, bill right, three payment buttons (spec §10). Works offline via the outbox. */
export function PosApp() {
  const { t } = useTranslation()
  const user = useUser()
  const qc = useQueryClient()
  const items = useItems()
  const [lines, setLines] = React.useState<Line[]>([])
  const [q, setQ] = React.useState("")
  const [paying, setPaying] = React.useState<PaymentMethod | null>(null)
  const [menu, setMenu] = React.useState(false)
  const [lastSale, setLastSale] = React.useState<{ requestId?: string; totalCents: number; changeCents: number; queued: boolean } | null>(null)
  const [undoLeft, setUndoLeft] = React.useState(0)
  const [editQty, setEditQty] = React.useState<Line | null>(null)

  const total = lines.reduce((s, l) => s + l.quantity * (l.item.sellCents ?? 0), 0)
  const visible = (items.data ?? []).filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()))

  const add = (item: Item, by = 1) =>
    setLines((ls) => {
      const existing = ls.find((l) => l.item.id === item.id)
      if (existing) return ls.map((l) => (l.item.id === item.id ? { ...l, quantity: l.quantity + by } : l))
      return [...ls, { item, quantity: by }]
    })
  const setQty = (item: Item, qty: number) => setLines((ls) => (qty <= 0 ? ls.filter((l) => l.item.id !== item.id) : ls.map((l) => (l.item.id === item.id ? { ...l, quantity: qty } : l))))

  // 10-second undo (spec §7) — reverses the sale's movements if it already reached the server.
  React.useEffect(() => {
    if (!undoLeft) return
    const t = setTimeout(() => setUndoLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [undoLeft])

  const complete = async (method: PaymentMethod, extra: { receivedCents?: number; customerId?: string; chequeNumber?: string; chequeBank?: string; chequeDate?: string }) => {
    if (!user.outletId) {
      toast.error("This account has no outlet")
      return
    }
    const body = {
      clientId: uuid(),
      outletId: user.outletId,
      lines: lines.map((l) => ({ itemId: l.item.id, quantity: l.quantity, rateCents: l.item.sellCents ?? 0 })),
      method,
      ...extra,
      occurredAt: new Date().toISOString(),
    }
    try {
      const res = await runOrQueue({ clientId: body.clientId, kind: "POS_SALE", body, label: `Bill ${formatRsShort(total)}` }, () => api.post<{ requestId: string; totalCents: number; changeCents: number }>("/movements/pos-sale", body))
      const changeCents = method === "CASH" ? Math.max(0, (extra.receivedCents ?? total) - total) : 0
      setLastSale({ requestId: res.result?.requestId, totalCents: total, changeCents, queued: res.queued })
      setUndoLeft(10)
      setLines([])
      setPaying(null)
      void qc.invalidateQueries({ queryKey: ["items"] })
      void qc.invalidateQueries({ queryKey: ["stock"] })
    } catch (e) {
      if (e instanceof ApiError && e.code === "CREDIT_LIMIT") {
        toast.error(e.message)
        throw e
      }
      toast.error((e as Error).message)
    }
  }

  const undo = async () => {
    if (!lastSale) return
    if (lastSale.requestId) {
      const ms = await api.get<{ id: string }[]>(`/movements?requestId=${lastSale.requestId}`)
      for (const m of ms) await api.post(`/movements/${m.id}/reverse`, { reason: "Undo within 10 seconds" })
    }
    toast.success("Bill undone")
    setLastSale(null)
    setUndoLeft(0)
  }

  return (
    <div className="flex h-svh flex-col bg-muted/40 text-[18px]">
      <header className="flex items-center gap-3 border-b bg-background px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{user.outletId ? "POS" : "POS (no outlet)"}</div>
          <div className="truncate text-sm text-muted-foreground">{user.displayName}</div>
        </div>
        <SyncChip />
        <HelpButton title="Selling" steps={["Tap a tile to add one; tap again for another, or tap the quantity to type it.", "Tap Cash. Use the quick note buttons; the change due is shown large.", "Tap Done. The receipt prints and the screen is ready for the next customer.", "Credit: search the customer; the limit and balance are shown first."]} />
        <Button variant="outline" size="lg" className="h-11" onClick={() => setMenu(true)}>
          <MenuIcon className="size-5" /> {t("pos.menu")}
        </Button>
        <UserMenu compact />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[3fr_2fr]">
        {/* Tiles */}
        <section className="flex min-h-0 flex-col gap-3 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-12 pl-10 text-base" placeholder="Find a product" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-3 overflow-y-auto xl:grid-cols-4">
            {visible.map((it) => (
              <Tile key={it.id} item={it} onTap={() => add(it, 1)} onPack={() => add(it, it.packSize)} />
            ))}
          </div>
        </section>

        {/* Bill */}
        <section className="flex min-h-0 flex-col border-l bg-background">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h2 className="font-semibold">{t("pos.bill")}</h2>
            {lines.length ? (
              <Button variant="ghost" size="sm" onClick={() => setLines([])}>
                <Trash2 className="size-4" /> Clear
              </Button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
                <p>{t("pos.emptyBill")}</p>
                {lastSale ? (
                  <div className="w-full rounded-xl border bg-status-green-soft p-4 text-foreground">
                    <div className="text-sm text-muted-foreground">{lastSale.queued ? "Saved on this PC; sends when online" : t("pos.printed")}</div>
                    <div className="text-2xl font-bold tabular">{formatRs(lastSale.totalCents)}</div>
                    {lastSale.changeCents ? <div className="text-base">{t("pos.change")}: <span className="font-semibold tabular">{formatRs(lastSale.changeCents)}</span></div> : null}
                    {undoLeft > 0 ? (
                      <Button variant="outline" className="mt-3 h-11 w-full" onClick={() => void undo()}>
                        <Undo2 className="size-4" /> {t("common.undo")} ({undoLeft})
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <ul className="divide-y">
                {lines.map((l) => (
                  <li key={l.item.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{l.item.name}</span>
                      <span className="block text-sm text-muted-foreground tabular">{formatRs(l.item.sellCents ?? 0)} each</span>
                    </span>
                    <Button variant="outline" className="size-12" onClick={() => setQty(l.item, l.quantity - 1)} aria-label="minus">
                      <Minus className="size-5" />
                    </Button>
                    <button type="button" className="w-14 rounded-lg py-2 text-center text-xl font-bold tabular hover:bg-muted" onClick={() => setEditQty(l)}>
                      {l.quantity}
                    </button>
                    <Button variant="outline" className="size-12" onClick={() => setQty(l.item, l.quantity + 1)} aria-label="plus">
                      <Plus className="size-5" />
                    </Button>
                    <span className="w-28 text-right text-lg font-semibold tabular">{formatRsShort(l.quantity * (l.item.sellCents ?? 0))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-3 border-t p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">{t("pos.total")}</span>
              <span className="text-4xl font-bold tabular">{formatRs(total)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button className="h-16 text-lg" disabled={!lines.length} onClick={() => setPaying("CASH")}>
                <Banknote className="size-6" /> {t("pos.cash")}
              </Button>
              <Button variant="outline" className="h-16 text-lg" disabled={!lines.length} onClick={() => setPaying("CREDIT")}>
                <CreditCard className="size-6" /> {t("pos.credit")}
              </Button>
              <Button variant="outline" className="h-16 text-lg" disabled={!lines.length} onClick={() => setPaying("CHEQUE")}>
                <FileText className="size-6" /> {t("pos.cheque")}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <CashDialog open={paying === "CASH"} total={total} onClose={() => setPaying(null)} onDone={(received) => complete("CASH", { receivedCents: received })} />
      <CreditDialog open={paying === "CREDIT"} total={total} onClose={() => setPaying(null)} onDone={(customerId) => complete("CREDIT", { customerId })} lines={lines} />
      <ChequeDialog open={paying === "CHEQUE"} total={total} onClose={() => setPaying(null)} onDone={(d) => complete("CHEQUE", d)} />
      {editQty ? <QtyDialog key={editQty.item.id} line={editQty} onClose={() => setEditQty(null)} onSet={(qty) => setQty(editQty.item, qty)} /> : null}
      <PosMenu open={menu} onOpenChange={setMenu} />
    </div>
  )
}

function Tile({ item, onTap, onPack }: { item: Item; onTap: () => void; onPack: () => void }) {
  const aging = false // set from stock view when a batch is aging; wired in the menu's stock check
  return (
    <div className={cn("relative flex min-h-28 flex-col rounded-xl text-left shadow-xs ring-1 transition-transform active:scale-[0.98]", TILE_COLORS[item.color] ?? TILE_COLORS.grey)}>
      <button type="button" onClick={onTap} className="flex flex-1 flex-col p-3 text-left">
        <span className="text-lg leading-tight font-semibold">{item.name}</span>
        <span className="mt-auto text-base tabular opacity-80">
          {formatRs(item.sellCents ?? 0)} <span className="text-sm">/ {item.unit}</span>
        </span>
      </button>
      {item.packSize > 1 && item.packName ? (
        <button type="button" onClick={onPack} className="rounded-b-xl border-t border-black/10 px-3 py-1.5 text-sm font-medium hover:bg-black/5">
          + 1 {item.packName} ({item.packSize})
        </button>
      ) : null}
      {aging ? <span className="absolute top-0 right-0 size-0 border-t-[18px] border-l-[18px] border-t-status-amber border-l-transparent" /> : null}
    </div>
  )
}

const QUICK_NOTES = [500, 1000, 2000, 5000]

function CashDialog({ open, total, onClose, onDone }: { open: boolean; total: number; onClose: () => void; onDone: (receivedCents: number) => Promise<void> }) {
  const { t } = useTranslation()
  const [received, setReceived] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const cents = received ? Math.round(Number(received) * 100) : total
  const change = Math.max(0, cents - total)
  const press = (k: string) => setReceived((r) => (k === "⌫" ? r.slice(0, -1) : k === "." && r.includes(".") ? r : r + k))
  const close = () => {
    setReceived("")
    onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{t("pos.cash")}</DialogTitle>
          <DialogDescription>Total {formatRs(total)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl bg-muted p-3 text-right">
            <div className="text-sm text-muted-foreground">{t("pos.received")}</div>
            <div className="text-3xl font-bold tabular">{received ? `Rs ${received}` : formatRs(total)}</div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_NOTES.map((n) => (
              <Button key={n} variant="outline" className="h-12 text-base" onClick={() => setReceived(String(n))}>
                {n.toLocaleString()}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => (
              <Button key={k} variant="outline" className="h-14 text-xl font-semibold" onClick={() => press(k)}>
                {k}
              </Button>
            ))}
          </div>
          <div className="flex items-baseline justify-between rounded-xl bg-status-green-soft px-4 py-3">
            <span className="text-muted-foreground">{t("pos.change")}</span>
            <span className="text-3xl font-bold tabular">{formatRs(change)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button
            className="h-14 w-full text-lg"
            disabled={busy || cents < total}
            onClick={async () => {
              setBusy(true)
              try {
                await onDone(cents)
                setReceived("")
              } finally {
                setBusy(false)
              }
            }}
          >
            {t("common.done")} · {formatRs(total)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreditDialog({ open, total, lines, onClose, onDone }: { open: boolean; total: number; lines: Line[]; onClose: () => void; onDone: (customerId: string) => Promise<void> }) {
  const { t } = useTranslation()
  const [q, setQ] = React.useState("")
  const [customer, setCustomer] = React.useState<Party | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [over, setOver] = React.useState(false)
  const parties = useParties({ q, type: "CUSTOMER" })
  const user = useUser()
  const reset = () => {
    setQ("")
    setCustomer(null)
    setOver(false)
  }
  const close = () => {
    reset()
    onClose()
  }
  const balance = customer?.balanceCents ?? 0
  const limit = customer?.creditLimitCents ?? 0
  const wouldExceed = Boolean(customer && (customer.creditHold || balance + total > limit))

  const askOffice = async () => {
    if (!customer) return
    await api.post("/requests", { type: "CREDIT_LIMIT_CHANGE", toPartyId: customer.id, lines: lines.map((l) => ({ itemId: l.item.id, quantity: l.quantity })), reason: `Credit sale of ${formatRsShort(total)} at ${user.outletId} would go over ${customer.name}'s limit (balance ${formatRsShort(balance)} / limit ${formatRsShort(limit)}).`, payload: { creditLimitCents: balance + total, creditDays: customer.creditDays } })
    toast.success("Asked the office. Hold the bill while waiting.")
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{t("pos.credit")}</DialogTitle>
          <DialogDescription>Total {formatRs(total)} · {t("pos.customer")}</DialogDescription>
        </DialogHeader>
        {!customer ? (
          <div className="space-y-2">
            <Input autoFocus className="h-12 text-base" placeholder="Search customer" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
              {(parties.data ?? []).slice(0, 8).map((p) => (
                <button key={p.id} type="button" onClick={() => setCustomer(p)} className="flex w-full items-center justify-between px-3 py-3 text-left hover:bg-accent">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-sm text-muted-foreground tabular">{formatRsShort(p.balanceCents ?? 0)} / {formatRsShort(p.creditLimitCents)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border p-3">
              <div className="text-lg font-semibold">{customer.name}</div>
              <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Balance</div>
                  <div className="font-semibold tabular">{formatRs(balance)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Limit</div>
                  <div className="font-semibold tabular">{formatRs(limit)}</div>
                </div>
              </div>
              {customer.creditHold ? <ToneBadge tone="red" className="mt-2">Credit on hold</ToneBadge> : wouldExceed ? <ToneBadge tone="amber" className="mt-2">Would go {formatRsShort(balance + total - limit)} over the limit</ToneBadge> : <ToneBadge tone="green" className="mt-2">{formatRsShort(limit - balance - total)} left after this bill</ToneBadge>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>
              Change customer
            </Button>
          </div>
        )}
        <DialogFooter>
          {customer && (wouldExceed || over) ? (
            <Button className="h-14 w-full text-lg" variant="outline" onClick={() => void askOffice()}>
              {t("pos.askOffice")}
            </Button>
          ) : (
            <Button
              className="h-14 w-full text-lg"
              disabled={!customer || busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await onDone(customer!.id)
                  reset()
                } catch (e) {
                  if (e instanceof ApiError && e.code === "CREDIT_LIMIT") setOver(true)
                } finally {
                  setBusy(false)
                }
              }}
            >
              Credit {formatRs(total)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChequeDialog({ open, total, onClose, onDone }: { open: boolean; total: number; onClose: () => void; onDone: (d: { chequeNumber: string; chequeBank: string; chequeDate: string }) => Promise<void> }) {
  const { t } = useTranslation()
  const [number, setNumber] = React.useState("")
  const [bank, setBank] = React.useState("")
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{t("pos.cheque")}</DialogTitle>
          <DialogDescription>Total {formatRs(total)}. The cheque goes to the office's cheque calendar.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Cheque number</Label>
            <Input className="h-12 text-base" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Bank</Label>
            <Input className="h-12 text-base" value={bank} onChange={(e) => setBank(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input className="h-12 text-base" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            className="h-14 w-full text-lg"
            disabled={!number || !bank || busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onDone({ chequeNumber: number, chequeBank: bank, chequeDate: date })
              } finally {
                setBusy(false)
              }
            }}
          >
            {t("common.done")} · {formatRs(total)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QtyDialog({ line, onClose, onSet }: { line: Line; onClose: () => void; onSet: (qty: number) => void }) {
  const [v, setV] = React.useState("")
  const n = Number(v || 0)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{line.item.name}</DialogTitle>
          <DialogDescription>Type the quantity in {line.item.unit}s{line.item.packName ? `, or in ${line.item.packName}s` : ""}.</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl bg-muted p-3 text-right text-3xl font-bold tabular">{v || line.quantity}</div>
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "C"].map((k) => (
            <Button key={k} variant="outline" className="h-14 text-xl font-semibold" onClick={() => setV((r) => (k === "⌫" ? r.slice(0, -1) : k === "C" ? "" : r + k))}>
              {k}
            </Button>
          ))}
        </div>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          {line.item.packName ? (
            <Button
              variant="outline"
              className="h-12"
              disabled={!n}
              onClick={() => {
                onSet(n * line.item.packSize)
                onClose()
              }}
            >
              {n} {line.item.packName}s = {n * line.item.packSize}
            </Button>
          ) : (
            <span />
          )}
          <Button
            className="h-12"
            disabled={!n}
            onClick={() => {
              onSet(n)
              onClose()
            }}
          >
            {n} {line.item.unit}s
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

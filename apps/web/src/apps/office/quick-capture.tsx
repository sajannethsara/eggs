import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Zap, Plus, Minus, Check } from "lucide-react"
import { toast } from "sonner"
import type { RequestType } from "shared"
import { api } from "@/lib/api"
import { useParties, useItems } from "@/lib/queries"
import type { Party, Item } from "@/lib/types"
import { cn, formatRsShort, initials } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { HealthDot, ToneBadge } from "@/components/common"

type Kind = "O" | "P" | "C" | "T" | "N"
const KINDS: { key: Kind; label: string; type: RequestType | null }[] = [
  { key: "O", label: "Order", type: "SALE_ORDER" },
  { key: "P", label: "Price change", type: "PRICE_CHANGE" },
  { key: "C", label: "Complaint", type: "RETURN" },
  { key: "T", label: "Task", type: "CALL_TASK" },
  { key: "N", label: "Note only", type: null },
]

/** Record a call in seconds: F2 → name → note → one key → prefilled form → Enter (spec §9.1). */
export function QuickCapture() {
  const qc = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState("")
  const [party, setParty] = React.useState<Party | null>(null)
  const [note, setNote] = React.useState("")
  const [kind, setKind] = React.useState<Kind | null>(null)
  const parties = useParties({ q })
  const items = useItems(party?.id)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const noteRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const reset = () => {
    setQ("")
    setParty(null)
    setNote("")
    setKind(null)
  }

  const matches = (parties.data ?? []).filter((p) => p.type === "CUSTOMER" || p.type === "SUPPLIER").slice(0, 6)

  // One key picks what the note becomes, from the note field.
  const onNoteKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const k = e.key.toUpperCase() as Kind
    if (note.length === 0 && ["O", "P", "C", "T", "N"].includes(k)) {
      // first keystroke empty: treat as text, not a command
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      setKind("N")
    }
  }

  const saveNoteOnly = async () => {
    if (!party) return
    await api.post("/notes", { partyId: party.id, channel: "CALL", text: note })
    toast.success("Note saved")
    void qc.invalidateQueries({ queryKey: ["party", party.id] })
    reset()
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-xl items-center gap-2 rounded-lg border bg-muted/50 px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Zap className="size-4 text-primary" />
        <span className="flex-1">Quick capture: type a name or phone, then the note…</span>
        <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">F2</kbd>
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) reset()
        }}
      >
        <DialogContent className="sm:max-w-2xl" onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus() }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="size-4 text-primary" /> Quick capture
            </DialogTitle>
            <DialogDescription>Name → note → one key: <kbd>O</kbd> order · <kbd>P</kbd> price · <kbd>C</kbd> complaint · <kbd>T</kbd> task · <kbd>N</kbd> note only</DialogDescription>
          </DialogHeader>

          {!party ? (
            <div className="space-y-2">
              <Input
                ref={inputRef}
                placeholder="Name or phone number"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches[0]) setParty(matches[0])
                }}
                className="h-11 text-base"
              />
              <div className="divide-y rounded-lg border">
                {matches.map((p, i) => (
                  <button key={p.id} type="button" onClick={() => setParty(p)} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent", i === 0 && "bg-accent/60")}>
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs">{initials(p.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <HealthDot colour={p.health?.colour ?? "green"} /> {p.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {p.phone} · {p.type === "SUPPLIER" ? "supplier" : p.segment?.replace("B2B_", "").toLowerCase()} · balance {formatRsShort(p.balanceCents ?? 0)}
                      </span>
                    </span>
                    {i === 0 ? <kbd className="rounded border px-1.5 text-[10px]">Enter</kbd> : null}
                  </button>
                ))}
                {q && matches.length === 0 ? (
                  <NewPartyRow q={q} onCreated={(p) => setParty(p)} />
                ) : null}
              </div>
            </div>
          ) : kind === null || kind === "N" ? (
            <div className="space-y-3">
              <PartyStrip party={party} onClear={() => setParty(null)} />
              <Textarea
                ref={noteRef}
                autoFocus
                placeholder='e.g. "wants 300 eggs + 20 coconuts tomorrow morning"'
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={onNoteKey}
                className="min-h-24 text-base"
              />
              <div className="flex flex-wrap gap-2">
                {KINDS.map((k) => (
                  <Button
                    key={k.key}
                    variant={k.key === "N" ? "secondary" : "outline"}
                    className="h-10"
                    onClick={() => (k.key === "N" ? void saveNoteOnly() : setKind(k.key))}
                    disabled={!note}
                  >
                    <kbd className="rounded border bg-background px-1.5 font-mono text-[11px]">{k.key}</kbd>
                    {k.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <CaptureForm
              kind={kind}
              party={party}
              note={note}
              items={items.data ?? []}
              onBack={() => setKind(null)}
              onDone={() => {
                reset()
                setOpen(false)
                void qc.invalidateQueries()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function PartyStrip({ party, onClear }: { party: Party; onClear: () => void }) {
  return (
    <button type="button" onClick={onClear} className="flex w-full items-center gap-3 rounded-lg bg-muted px-3 py-2 text-left">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">{initials(party.name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{party.name}</span>
        <span className="block text-xs text-muted-foreground">
          balance {formatRsShort(party.balanceCents ?? 0)} · {party.contactTier.toLowerCase().replace("_", " ")} · {party.usualDays.length ? "usual order known" : "no usual order"}
        </span>
      </span>
      {party.creditHold ? <ToneBadge tone="red">credit hold</ToneBadge> : null}
    </button>
  )
}

function NewPartyRow({ q, onCreated }: { q: string; onCreated: (p: Party) => void }) {
  const isPhone = /^\+?\d[\d\s-]{6,}$/.test(q)
  const [name, setName] = React.useState(isPhone ? "" : q)
  const [phone, setPhone] = React.useState(isPhone ? q : "")
  const create = async () => {
    const p = await api.post<Party>("/parties", { type: "CUSTOMER", name, phone: phone || undefined, segment: "B2B_REGULAR", contactTier: "STAFF" })
    toast.success("New customer saved; fill in the rest later")
    onCreated(p)
  }
  return (
    <div className="space-y-2 p-3">
      <p className="text-sm text-muted-foreground">Unknown caller. Save with just a name and phone:</p>
      <div className="flex gap-2">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button onClick={() => void create()} disabled={!name}>
          <Plus className="size-4" /> Save
        </Button>
      </div>
    </div>
  )
}

/** The matching form, already filled in from the note, the usual order and current rates. */
function CaptureForm({ kind, party, note, items, onBack, onDone }: { kind: Kind; party: Party; note: string; items: Item[]; onBack: () => void; onDone: () => void }) {
  const tomorrow = React.useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }, [])
  const parsed = React.useMemo(() => parseLines(note, items), [note, items])
  const [lines, setLines] = React.useState<{ itemId: string; quantity: number }[]>(() => (parsed.length ? parsed : (party.usualOrder ?? [])))
  const [due, setDue] = React.useState(/tomorrow/i.test(note) ? tomorrow : new Date().toISOString().slice(0, 10))
  const [windowStart, setWindowStart] = React.useState(party.windowStart ?? "")
  const [windowEnd, setWindowEnd] = React.useState(party.windowEnd ?? "")
  const [priceItem, setPriceItem] = React.useState(items[0]?.id ?? "")
  const [price, setPrice] = React.useState(() => {
    const m = note.match(/(\d+(?:\.\d+)?)/)
    return m ? m[1] : ""
  })
  const [direction, setDirection] = React.useState<"BUY" | "SELL">(party.type === "SUPPLIER" ? "BUY" : "SELL")
  const [approveNow, setApproveNow] = React.useState(kind === "O")
  const [busy, setBusy] = React.useState(false)
  const first = React.useRef<HTMLButtonElement>(null)

  const total = lines.reduce((s, l) => s + l.quantity * (items.find((i) => i.id === l.itemId)?.sellCents ?? 0), 0)
  const setQty = (itemId: string, qty: number) => setLines((ls) => (qty <= 0 ? ls.filter((l) => l.itemId !== itemId) : ls.some((l) => l.itemId === itemId) ? ls.map((l) => (l.itemId === itemId ? { ...l, quantity: qty } : l)) : [...ls, { itemId, quantity: qty }]))

  const submit = async () => {
    setBusy(true)
    try {
      const n = await api.post<{ id: string }>("/notes", { partyId: party.id, channel: kind === "C" ? "COMPLAINT" : "CALL", text: note })
      if (kind === "O") {
        const r = await api.post<{ id: string }>("/requests", { type: "SALE_ORDER", toPartyId: party.id, lines, dueAt: due, windowStart: windowStart || undefined, windowEnd: windowEnd || undefined, noteId: n.id, reason: note })
        if (approveNow) await api.post(`/requests/${r.id}/decide`, { action: "APPROVE" })
        toast.success(approveNow ? `Order confirmed · ${formatRsShort(total)}` : "Order saved for review")
      } else if (kind === "P") {
        const res = await api.post<{ request: unknown | null }>("/rates", { itemId: priceItem, partyId: party.type === "SUPPLIER" ? party.id : undefined, direction, priceCents: Math.round(Number(price) * 100), validFrom: due, sourceNote: `${party.name}: ${note}` })
        toast.success(res.request ? "Price change sent to the owner" : "New price saved")
      } else if (kind === "C") {
        await api.post("/requests", { type: "RETURN", fromPartyId: party.id, lines, noteId: n.id, reason: note, dueAt: due })
        toast.success("Complaint logged; replacement waiting for review")
      } else if (kind === "T") {
        const r = await api.post<{ id: string }>("/requests", { type: "CALL_TASK", toPartyId: party.id, lines: [], noteId: n.id, reason: note, dueAt: due })
        await api.post(`/requests/${r.id}/decide`, { action: "APPROVE" })
        toast.success("Task created")
      }
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <PartyStrip party={party} onClear={onBack} />
      <p className="rounded-lg border-l-4 border-primary bg-primary/5 px-3 py-2 text-sm italic">"{note}"</p>

      {kind === "O" || kind === "C" ? (
        <div className="space-y-2">
          <Label>{kind === "O" ? "Items (from the note, or the usual order)" : "Items to replace"}</Label>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {items.filter((i) => i.posOrder != null).map((it) => {
              const l = lines.find((x) => x.itemId === it.id)
              return (
                <div key={it.id} className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5", l && "border-primary bg-primary/5")}>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-medium">{it.name}</span>
                    <span className="block text-xs text-muted-foreground">{formatRsShort(it.sellCents ?? 0)} / {it.unit}</span>
                  </span>
                  <Button type="button" size="icon-sm" variant="outline" onClick={() => setQty(it.id, (l?.quantity ?? 0) - (it.packSize > 1 ? it.packSize : 1))} aria-label="less">
                    <Minus className="size-3.5" />
                  </Button>
                  <Input type="number" inputMode="numeric" className="h-8 w-20 text-right tabular" value={l?.quantity ?? ""} placeholder="0" onChange={(e) => setQty(it.id, Number(e.target.value))} />
                  <Button type="button" size="icon-sm" variant="outline" onClick={() => setQty(it.id, (l?.quantity ?? 0) + (it.packSize > 1 ? it.packSize : 1))} aria-label="more">
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {kind === "P" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Item</Label>
            <select className="h-9 w-full rounded-lg border bg-background px-2 text-sm" value={priceItem} onChange={(e) => setPriceItem(e.target.value)}>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{direction === "BUY" ? "New buy price (Rs)" : "New sell price (Rs)"}</Label>
            <Input type="number" step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Direction</Label>
            <select className="h-9 w-full rounded-lg border bg-background px-2 text-sm" value={direction} onChange={(e) => setDirection(e.target.value as "BUY" | "SELL")}>
              <option value="BUY">Buy (supplier)</option>
              <option value="SELL">Sell</option>
            </select>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="qc-due">{kind === "P" ? "Starts" : "Due"}</Label>
          <Input id="qc-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        {kind === "O" ? (
          <>
            <div className="space-y-1.5">
              <Label>Window from</Label>
              <Input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>to</Label>
              <Input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
            </div>
          </>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <div className="text-sm text-muted-foreground">
          {kind === "O" ? (
            <>
              Total <span className="font-semibold text-foreground tabular">{formatRsShort(total)}</span>
              {party.type === "CUSTOMER" && (party.balanceCents ?? 0) + total > party.creditLimitCents ? <span className="ml-2 text-status-red">over credit limit</span> : null}
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {kind === "O" ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={approveNow} onChange={(e) => setApproveNow(e.target.checked)} className="size-4 accent-primary" />
              Confirmed by call
            </label>
          ) : null}
          <Button ref={first} type="submit" className="h-10" disabled={busy || ((kind === "O" || kind === "C") && lines.length === 0) || (kind === "P" && !price)}>
            <Check className="size-4" />
            Save <kbd className="ml-1 rounded border border-primary-foreground/30 px-1 font-mono text-[10px]">Enter</kbd>
          </Button>
        </div>
      </div>
    </form>
  )
}

/** "300 eggs + 20 coconuts" → lines. Matches item names loosely; unknown words are ignored. */
export function parseLines(note: string, items: Item[]): { itemId: string; quantity: number }[] {
  const out: { itemId: string; quantity: number }[] = []
  const re = /(\d+)\s*(trays?|cases?|bags?|bottles?|packs?)?\s*(?:of\s+)?([a-z][a-z ]{1,20}?)(?=[\s,+.;]|$)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(note))) {
    const qty = Number(m[1])
    const pack = m[2]?.toLowerCase()
    const word = m[3].trim().toLowerCase()
    const item = items.find((i) => {
      const n = i.name.toLowerCase()
      return n.startsWith(word) || word.startsWith(n.split(" ")[0]) || n.split(" ")[0].startsWith(word.replace(/s$/, ""))
    })
    if (!item) continue
    const mult = pack && item.packName && pack.startsWith(item.packName.toLowerCase().slice(0, 3)) ? item.packSize : 1
    out.push({ itemId: item.id, quantity: qty * mult })
  }
  return out
}

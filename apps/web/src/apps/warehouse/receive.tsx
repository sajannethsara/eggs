import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Check, PackageCheck, Camera } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useItems } from "@/lib/queries"
import type { RequestRow } from "@/lib/types"
import { cn, uuid, formatDay } from "@/lib/utils"
import { PhoneHeader, Screen, PrimaryActionBar } from "@/components/frames"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { EmptyState, ListSkeleton } from "@/components/common"

const REASONS = ["short", "damaged", "poor quality"] as const

/** Receive against an approved purchase or transfer; a new batch tracks freshness (spec §12.1). */
export function WarehouseReceive() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const todo = useQuery({ queryKey: ["wh-todo"], queryFn: () => api.get<{ receive: RequestRow[]; send: RequestRow[] }>("/requests/warehouse-todo") })
  const items = useItems()
  const r = todo.data?.receive.find((x) => x.id === id)
  const [qty, setQty] = React.useState<Record<string, number>>({})
  const [reason, setReason] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const [unexpected, setUnexpected] = React.useState(false)
  const [uxLines, setUxLines] = React.useState<Record<string, number>>({})
  const [uxSupplier, setUxSupplier] = React.useState("")
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => api.get<{ id: string; name: string }[]>("/parties?type=SUPPLIER") })

  const submit = async () => {
    if (!r) return
    setBusy(true)
    try {
      await api.post(`/movements/receive/${r.id}`, { clientId: uuid(), lines: r.lines.map((l) => ({ itemId: l.itemId, quantity: qty[l.itemId] ?? l.quantity })) })
      toast.success("Received. Stock is up and a new batch is tracked.")
      void qc.invalidateQueries()
      navigate("/warehouse")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submitUnexpected = async () => {
    setBusy(true)
    try {
      const wh = await api.get<{ id: string }[]>("/parties?type=WAREHOUSE").then((ps) => ps[0])
      for (const [itemId, q] of Object.entries(uxLines)) {
        if (q > 0) await api.post("/movements", { clientId: uuid(), kind: "GOODS", fromPartyId: uxSupplier, toPartyId: wh.id, itemId, quantity: q, reason: "Unexpected delivery" })
      }
      toast.success("Received. The office sees it as an unexpected delivery.")
      void qc.invalidateQueries()
      navigate("/warehouse")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const header = (title: string) => (
    <PhoneHeader
      title={title}
      left={
        <Button variant="ghost" size="icon" onClick={() => (id || unexpected ? (setUnexpected(false), navigate("/warehouse/receive")) : navigate("/warehouse"))} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
      }
      className="sm:rounded-none"
    />
  )

  if (unexpected) {
    return (
      <>
        {header("Unexpected delivery")}
        <Screen>
          <select className="h-12 w-full rounded-lg border bg-background px-3 text-base" value={uxSupplier} onChange={(e) => setUxSupplier(e.target.value)}>
            <option value="">Which supplier?</option>
            {(suppliers.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {(items.data ?? []).map((it) => (
            <div key={it.id} className="grid grid-cols-[1fr_7rem] items-center gap-2">
              <span className="font-medium">{it.name}</span>
              <Input type="number" inputMode="numeric" className="h-12 text-right text-lg tabular" placeholder="0" value={uxLines[it.id] ?? ""} onChange={(e) => setUxLines({ ...uxLines, [it.id]: Number(e.target.value) })} />
            </div>
          ))}
        </Screen>
        <PrimaryActionBar>
          <Button className="h-14 w-full text-lg" disabled={!uxSupplier || busy || !Object.values(uxLines).some((q) => q > 0)} onClick={() => void submitUnexpected()}>
            <PackageCheck className="size-5" /> Received
          </Button>
        </PrimaryActionBar>
      </>
    )
  }

  if (!id) {
    return (
      <>
        {header("Receive")}
        <Screen>
          {todo.isLoading ? (
            <ListSkeleton />
          ) : !todo.data?.receive.length ? (
            <EmptyState icon={PackageCheck} title="Nothing expected" hint="Approved purchases and drivers' signed pickups appear here." />
          ) : (
            todo.data.receive.map((x) => (
              <Card key={x.id} size="sm" className="cursor-pointer gap-1 px-3 hover:bg-accent" onClick={() => navigate(`/warehouse/receive/${x.id}`)}>
                <div className="flex justify-between font-semibold">
                  <span>{x.fromParty?.name}</span>
                  <span className="text-sm font-normal text-muted-foreground">{x.dueAt ? formatDay(x.dueAt) : ""}</span>
                </div>
                <p className="text-sm text-muted-foreground">{x.lines.map((l) => `${l.quantity} ${l.item.name}`).join(", ")}</p>
              </Card>
            ))
          )}
          <Button variant="outline" className="h-12 w-full" onClick={() => setUnexpected(true)}>
            Unexpected delivery
          </Button>
        </Screen>
      </>
    )
  }

  if (!r) return <>{header("Receive")}<Screen><ListSkeleton /></Screen></>

  const changed = r.lines.some((l) => (qty[l.itemId] ?? l.quantity) !== l.quantity)
  return (
    <>
      {header(`From ${r.fromParty?.name}`)}
      <Screen>
        <p className="text-sm text-muted-foreground">Tap All correct, or change any line and pick a reason.</p>
        {r.lines.map((l) => {
          const q = qty[l.itemId] ?? l.quantity
          const diff = q !== l.quantity
          return (
            <div key={l.id} className={cn("space-y-2 rounded-xl border p-3", diff && "border-status-amber bg-status-amber-soft/40")}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{l.item.name}</span>
                  <span className="block text-sm text-muted-foreground">expected {l.quantity} {l.item.unit}s</span>
                </span>
                <Input type="number" inputMode="numeric" className="h-12 w-28 text-right text-xl font-bold tabular" value={q} onChange={(e) => setQty({ ...qty, [l.itemId]: Number(e.target.value) })} />
              </div>
              {diff ? (
                <div className="flex flex-wrap gap-2">
                  {REASONS.map((rs) => (
                    <button key={rs} type="button" onClick={() => setReason({ ...reason, [l.itemId]: rs })} className={cn("min-h-10 rounded-full border px-3 text-sm font-medium", reason[l.itemId] === rs && "border-primary bg-primary text-primary-foreground")}>
                      {rs}
                    </button>
                  ))}
                  <Button type="button" variant="ghost" size="sm" className="h-10" onClick={() => toast.info("Photo is linked to the supplier for the spoilage report")}>
                    <Camera className="size-4" /> Photo
                  </Button>
                </div>
              ) : null}
            </div>
          )
        })}
      </Screen>
      <PrimaryActionBar>
        <Button className="h-14 w-full text-lg" disabled={busy} onClick={() => void submit()}>
          <Check className="size-5" /> {changed ? "Received with differences" : "All correct · Received"}
        </Button>
      </PrimaryActionBar>
    </>
  )
}

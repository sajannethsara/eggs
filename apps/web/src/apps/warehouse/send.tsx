import * as React from "react"
import { useNavigate } from "react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Send, Truck, Plus } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useItems, useStock } from "@/lib/queries"
import type { RequestRow } from "@/lib/types"
import { formatDay, uuid, packs } from "@/lib/utils"
import { PhoneHeader, Screen } from "@/components/frames"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { EmptyState, ListSkeleton, StatusBadge } from "@/components/common"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/** Approved transfers by outlet; oldest batch first; Packed → Handed to driver / Sent (spec §12.2). */
export function WarehouseSend() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const todo = useQuery({ queryKey: ["wh-todo"], queryFn: () => api.get<{ receive: RequestRow[]; send: RequestRow[] }>("/requests/warehouse-todo") })
  const drivers = useQuery({ queryKey: ["drivers"], queryFn: () => api.get<{ username: string; displayName: string }[]>("/auth/roles/DRIVER/users") })
  const stock = useStock()
  const [packed, setPacked] = React.useState<Record<string, boolean>>({})
  const [busy, setBusy] = React.useState<string | null>(null)
  const [newOpen, setNewOpen] = React.useState(false)
  const wh = stock.data?.holders.find((h) => h.type === "WAREHOUSE")

  const send = async (r: RequestRow, toDriverId: string | null) => {
    setBusy(r.id)
    try {
      await api.post(`/movements/send/${r.id}`, { clientId: uuid(), toDriverId })
      toast.success(toDriverId ? "Handed to driver" : "Sent. The outlet confirms on its POS.")
      void qc.invalidateQueries()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const oldestBatch = (itemId: string) => stock.data?.cells.find((c) => c.holderId === wh?.id && c.itemId === itemId)?.oldestBatchAt

  return (
    <>
      <PhoneHeader
        title="Send"
        subtitle="Approved transfers, oldest batch first"
        left={
          <Button variant="ghost" size="icon" onClick={() => navigate("/warehouse")} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
        }
        right={
          <Button variant="outline" size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="size-4" /> New transfer
          </Button>
        }
        className="sm:rounded-none"
      />
      <Screen>
        {todo.isLoading ? (
          <ListSkeleton />
        ) : !todo.data?.send.length ? (
          <EmptyState icon={Send} title="Nothing to send" hint="Transfers approved by the office appear here." />
        ) : (
          todo.data.send.map((r) => (
            <Card key={r.id} size="sm" className="gap-3 px-3">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">{r.toParty?.name}</span>
                <StatusBadge status={r.status === "IN_PROGRESS" ? "IN_PROGRESS" : packed[r.id] ? "NEXT" : "APPROVED"} />
              </div>
              <ul className="space-y-1">
                {r.lines.map((l) => (
                  <li key={l.id} className="flex justify-between text-base">
                    <span>
                      <span className="font-semibold">{packs(l.quantity, l.item.packSize, l.item.unit, l.item.packName)}</span> {l.item.name}
                    </span>
                    {l.item.perishable && oldestBatch(l.itemId) ? <span className="text-sm text-muted-foreground">batch {formatDay(oldestBatch(l.itemId)!)} first</span> : null}
                  </li>
                ))}
              </ul>
              {r.reason ? <p className="text-sm text-muted-foreground">{r.reason}</p> : null}
              {r.status === "IN_PROGRESS" ? (
                <p className="text-sm text-muted-foreground">On its way. The outlet confirms on arrival; any difference shows on both sides.</p>
              ) : !packed[r.id] ? (
                <Button className="h-12 w-full text-base" onClick={() => setPacked({ ...packed, [r.id]: true })}>
                  Packed
                </Button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <select className="h-12 rounded-lg border bg-background px-2 text-base" defaultValue="" onChange={(e) => e.target.value && void send(r, e.target.value)} disabled={busy === r.id}>
                    <option value="">Handed to driver…</option>
                    {(drivers.data ?? []).map((d) => (
                      <option key={d.username} value={(d as unknown as { id?: string }).id ?? d.username}>
                        {d.displayName}
                      </option>
                    ))}
                  </select>
                  <Button variant="outline" className="h-12 text-base" disabled={busy === r.id} onClick={() => void send(r, null)}>
                    <Truck className="size-5" /> Sent
                  </Button>
                </div>
              )}
            </Card>
          ))
        )}
      </Screen>
      <NewTransferDialog open={newOpen} onOpenChange={setNewOpen} />
    </>
  )
}

function NewTransferDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const items = useItems()
  const stock = useStock()
  const qc = useQueryClient()
  const [outlet, setOutlet] = React.useState("")
  const [lines, setLines] = React.useState<Record<string, number>>({})
  const [busy, setBusy] = React.useState(false)
  const outlets = (stock.data?.holders ?? []).filter((h) => h.type === "OUTLET")
  const wh = stock.data?.holders.find((h) => h.type === "WAREHOUSE")
  const submit = async () => {
    setBusy(true)
    try {
      await api.post("/requests", { type: "TRANSFER", fromPartyId: wh?.id, toPartyId: outlet, lines: Object.entries(lines).filter(([, q]) => q > 0).map(([itemId, quantity]) => ({ itemId, quantity })), reason: "Proposed by the warehouse keeper" })
      toast.success("Proposed. It goes to the office inbox.")
      void qc.invalidateQueries()
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
          <DialogTitle>New transfer</DialogTitle>
          <DialogDescription>Goes to the office inbox for approval.</DialogDescription>
        </DialogHeader>
        <select className="h-12 w-full rounded-lg border bg-background px-3 text-base" value={outlet} onChange={(e) => setOutlet(e.target.value)}>
          <option value="">To which outlet?</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {(items.data ?? []).map((it) => (
            <div key={it.id} className="grid grid-cols-[1fr_7rem] items-center gap-2">
              <span className="font-medium">{it.name}</span>
              <Input type="number" inputMode="numeric" className="h-11 text-right tabular" placeholder="0" value={lines[it.id] ?? ""} onChange={(e) => setLines({ ...lines, [it.id]: Number(e.target.value) })} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button className="h-11" disabled={!outlet || busy || !Object.values(lines).some((q) => q > 0)} onClick={() => void submit()}>
            Propose
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

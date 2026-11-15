import * as React from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Camera, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { SPOILAGE_REASONS } from "shared"
import { api } from "@/lib/api"
import { useItems, useStock } from "@/lib/queries"
import { cn, uuid, formatDay } from "@/lib/utils"
import { PhoneHeader, Screen, PrimaryActionBar } from "@/components/frames"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** Item → quantity → reason → photo; the oldest batch is suggested so the supplier can be traced (spec §12.4). */
export function WarehouseSpoiled() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const items = useItems()
  const stock = useStock()
  const [itemId, setItemId] = React.useState("")
  const [qty, setQty] = React.useState("")
  const [reason, setReason] = React.useState<string>("CRACKED")
  const [busy, setBusy] = React.useState(false)
  const wh = stock.data?.holders.find((h) => h.type === "WAREHOUSE")
  const cell = stock.data?.cells.find((c) => c.holderId === wh?.id && c.itemId === itemId)

  const submit = async () => {
    setBusy(true)
    try {
      const loss = await api.get<{ id: string; systemCode: string }[]>("/parties?type=SYSTEM").then((ps) => ps.find((p) => p.systemCode === "LOSS"))
      await api.post("/movements", { clientId: uuid(), kind: "GOODS", fromPartyId: wh?.id, toPartyId: loss?.id, itemId, quantity: Number(qty), reason: "spoilage", spoilageReason: reason })
      toast.success("Recorded. Stock moved to Loss and traced to the batch.")
      void qc.invalidateQueries()
      navigate("/warehouse")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PhoneHeader
        title="Spoiled"
        left={
          <Button variant="ghost" size="icon" onClick={() => navigate("/warehouse")} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
        }
        className="sm:rounded-none"
      />
      <Screen>
        <div className="grid grid-cols-2 gap-2">
          {(items.data ?? []).map((i) => (
            <button key={i.id} type="button" onClick={() => setItemId(i.id)} className={cn("min-h-14 rounded-xl border px-3 text-left text-base font-medium", itemId === i.id && "border-primary bg-primary/10")}>
              {i.name}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label className="text-base">Quantity</Label>
          <Input type="number" inputMode="numeric" className="h-14 text-2xl font-bold tabular" value={qty} onChange={(e) => setQty(e.target.value)} />
          {cell?.oldestBatchAt ? <p className="text-sm text-muted-foreground">From the batch received {formatDay(cell.oldestBatchAt)} (oldest), so the supplier is traced.</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {SPOILAGE_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className={cn("min-h-12 rounded-full border px-4 text-base font-medium capitalize", reason === r && "border-primary bg-primary text-primary-foreground")}>
              {r.toLowerCase()}
            </button>
          ))}
        </div>
        <Button variant="outline" className="h-12 w-full" onClick={() => toast.info("Opens the camera on a real device")}>
          <Camera className="size-5" /> Take a photo
        </Button>
      </Screen>
      <PrimaryActionBar>
        <Button variant="destructive" className="h-14 w-full text-lg" disabled={!itemId || !qty || busy} onClick={() => void submit()}>
          <Trash2 className="size-5" /> Record {qty || ""} spoiled
        </Button>
      </PrimaryActionBar>
    </>
  )
}

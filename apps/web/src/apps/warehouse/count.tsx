import * as React from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Check, Delete } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useStock } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { PhoneHeader, Screen, PrimaryActionBar } from "@/components/frames"
import { Button } from "@/components/ui/button"
import { ListSkeleton, EmptyState } from "@/components/common"

/** One item at a time with a large number pad; expected hidden until entered (spec §12.3). */
export function WarehouseCount() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const stock = useStock()
  const wh = stock.data?.holders.find((h) => h.type === "WAREHOUSE")
  const today = new Date().getDate()
  const list = React.useMemo(
    () => (stock.data?.cells ?? []).filter((c) => c.holderId === wh?.id).filter((_, i) => (i + today) % 2 === 0).slice(0, 8),
    [stock.data, wh?.id, today]
  )
  const [idx, setIdx] = React.useState(0)
  const [v, setV] = React.useState("")
  const [results, setResults] = React.useState<{ itemId: string; system: number; counted: number }[]>([])
  const [busy, setBusy] = React.useState(false)
  const current = list[idx]
  const name = (id: string) => stock.data?.items.find((i) => i.id === id)?.name ?? ""

  const next = () => {
    if (!current || v === "") return
    setResults([...results, { itemId: current.itemId, system: current.quantity, counted: Number(v) }])
    setV("")
    setIdx(idx + 1)
  }

  const finish = async () => {
    setBusy(true)
    try {
      const diffs = results.filter((r) => r.counted !== r.system && Math.abs(r.counted - r.system) / Math.max(1, r.system) > 0.02)
      if (diffs.length) {
        const loss = await api.get<{ id: string; systemCode: string }[]>("/parties?type=SYSTEM").then((ps) => ps.find((p) => p.systemCode === "LOSS"))
        for (const d of diffs) {
          const short = d.system - d.counted
          await api.post("/requests", { type: "STOCK_ADJUSTMENT", fromPartyId: short > 0 ? wh?.id : loss?.id, toPartyId: short > 0 ? loss?.id : wh?.id, lines: [{ itemId: d.itemId, quantity: Math.abs(short) }], reason: `Warehouse count: system ${d.system}, counted ${d.counted} ${name(d.itemId)}.` })
        }
        toast.success(`${diffs.length} difference(s) sent to the office as adjustments`)
      } else toast.success("Count matches the system")
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
        title="Count"
        subtitle={list.length ? `${Math.min(idx + 1, list.length)} of ${list.length} today` : "Today's list"}
        left={
          <Button variant="ghost" size="icon" onClick={() => navigate("/warehouse")} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
        }
        className="sm:rounded-none"
      />
      <Screen>
        {stock.isLoading ? (
          <ListSkeleton />
        ) : list.length === 0 ? (
          <EmptyState title="Nothing to count today" />
        ) : current ? (
          <>
            <div className="rounded-2xl border bg-card p-5 text-center">
              <div className="text-sm text-muted-foreground">How many</div>
              <div className="text-3xl font-semibold">{name(current.itemId)}</div>
              <div className="mt-4 text-5xl font-bold tabular">{v || "—"}</div>
              {v ? <div className={cn("mt-1 text-sm", Number(v) === current.quantity ? "text-status-green" : "text-status-amber")}>system says {current.quantity}</div> : <div className="mt-1 text-sm text-muted-foreground">expected hidden until you count</div>}
            </div>
            <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <Button key={d} variant="outline" className="h-16 text-2xl font-semibold" onClick={() => setV(v + d)}>
                  {d}
                </Button>
              ))}
              <Button variant="ghost" className="h-16" onClick={() => setV("")}>
                C
              </Button>
              <Button variant="outline" className="h-16 text-2xl font-semibold" onClick={() => setV(v + "0")}>
                0
              </Button>
              <Button variant="ghost" className="h-16" onClick={() => setV(v.slice(0, -1))} aria-label="Delete">
                <Delete className="size-6" />
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <h2 className="font-semibold">Done. Summary</h2>
            {results.map((r) => (
              <div key={r.itemId} className="flex justify-between rounded-lg border px-3 py-2 text-sm">
                <span>{name(r.itemId)}</span>
                <span className={cn("font-semibold tabular", r.counted !== r.system && "text-status-amber")}>
                  {r.counted} <span className="font-normal text-muted-foreground">/ {r.system}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Screen>
      <PrimaryActionBar>
        {current ? (
          <Button className="h-14 w-full text-lg" disabled={v === ""} onClick={next}>
            Next <Check className="size-5" />
          </Button>
        ) : (
          <Button className="h-14 w-full text-lg" disabled={busy || results.length === 0} onClick={() => void finish()}>
            Save count
          </Button>
        )}
      </PrimaryActionBar>
    </>
  )
}

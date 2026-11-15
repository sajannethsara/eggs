import * as React from "react"
import { Outlet, useNavigate } from "react-router"
import { Search } from "lucide-react"
import { useStock } from "@/lib/queries"
import { MobileFrame } from "@/components/frames"
import { Input } from "@/components/ui/input"

/** Tablet-first; the stock lookup search bar is on every screen (spec §12). */
export function WarehouseLayout() {
  return (
    <MobileFrame width={520}>
      <StockLookup />
      <Outlet />
    </MobileFrame>
  )
}

function StockLookup() {
  const stock = useStock()
  const [q, setQ] = React.useState("")
  const navigate = useNavigate()
  const items = (stock.data?.items ?? []).filter((i) => q && i.name.toLowerCase().includes(q.toLowerCase())).slice(0, 3)
  return (
    <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-2 backdrop-blur sm:rounded-t-[2rem]">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-11 pl-9 text-base" placeholder='Stock lookup: "does Outlet 2 have oil?"' value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQ("")} />
      </div>
      {items.length ? (
        <div className="mt-2 space-y-2">
          {items.map((it) => (
            <div key={it.id} className="rounded-xl border bg-card p-3 text-sm">
              <div className="font-semibold">{it.name}</div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
                {(stock.data?.holders ?? []).map((h) => {
                  const c = stock.data?.cells.find((x) => x.holderId === h.id && x.itemId === it.id)
                  return (
                    <div key={h.id} className="flex justify-between gap-2">
                      <span className="truncate text-muted-foreground">{h.name.replace(/^Outlet \d · /, "")}</span>
                      <span className="font-semibold tabular">{c?.quantity ?? 0}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { setQ(""); navigate("/warehouse") }}>
            close
          </button>
        </div>
      ) : null}
    </div>
  )
}

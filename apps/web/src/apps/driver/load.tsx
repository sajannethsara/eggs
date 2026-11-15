import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Check, PackageOpen } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useUser } from "@/lib/auth"
import { useRoute, useStock } from "@/lib/queries"
import { cn, uuid, packs } from "@/lib/utils"
import { PhoneHeader, Screen, PrimaryActionBar } from "@/components/frames"
import { SyncChip, UserMenu, ListSkeleton, EmptyState } from "@/components/common"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

/** Load check: what should be on the vehicle, tick or correct, Start route (spec §11.1). */
export function DriverLoad() {
  const { t } = useTranslation()
  const user = useUser()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const route = useRoute(undefined, user.id)
  const stock = useStock()
  const [qty, setQty] = React.useState<Record<string, number> | null>(null)
  const [ticked, setTicked] = React.useState<Record<string, boolean>>({})
  const [busy, setBusy] = React.useState(false)

  const needed = React.useMemo(() => {
    const m = new Map<string, { itemId: string; name: string; packSize: number; unit: string; packName: string | null; quantity: number }>()
    for (const s of route.data?.stops ?? []) {
      if (s.type !== "SALE_ORDER" || s.status === "DONE") continue
      for (const l of s.lines) {
        const e = m.get(l.itemId) ?? { itemId: l.itemId, name: l.item.name, packSize: l.item.packSize, unit: l.item.unit, packName: l.item.packName, quantity: 0 }
        e.quantity += l.quantity
        m.set(l.itemId, e)
      }
    }
    return [...m.values()]
  }, [route.data])

  const onVehicle = (itemId: string) => stock.data?.cells.find((c) => c.holderId === user.partyId && c.itemId === itemId)?.quantity ?? 0
  const toLoad = needed.map((n) => ({ ...n, load: Math.max(0, (qty?.[n.itemId] ?? n.quantity) - onVehicle(n.itemId)) }))
  const allTicked = needed.length > 0 && needed.every((n) => ticked[n.itemId])

  const start = async () => {
    setBusy(true)
    try {
      await api.post("/movements/load", { clientId: uuid(), lines: toLoad.map((l) => ({ itemId: l.itemId, quantity: l.load })) })
      toast.success("Route started. Stock moved from warehouse to your vehicle.")
      void qc.invalidateQueries()
      navigate("/driver")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PhoneHeader
        title="Load check"
        subtitle="What should be on the vehicle"
        right={
          <div className="flex items-center gap-1">
            <SyncChip />
            <UserMenu compact />
          </div>
        }
      />
      <Screen>
        {route.isLoading ? (
          <ListSkeleton />
        ) : needed.length === 0 ? (
          <EmptyState icon={PackageOpen} title="Nothing to load" hint="No deliveries left on today's route." />
        ) : (
          <ul className="space-y-2">
            {toLoad.map((n) => (
              <li key={n.itemId} className={cn("flex items-center gap-3 rounded-xl border p-3", ticked[n.itemId] && "border-status-green bg-status-green-soft/50")}>
                <button type="button" onClick={() => setTicked({ ...ticked, [n.itemId]: !ticked[n.itemId] })} className={cn("flex size-12 shrink-0 items-center justify-center rounded-full border-2", ticked[n.itemId] ? "border-status-green bg-status-green text-white" : "border-muted-foreground/40")} aria-label="tick">
                  {ticked[n.itemId] ? <Check className="size-6" /> : null}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{n.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {packs(qty?.[n.itemId] ?? n.quantity, n.packSize, n.unit, n.packName)}
                    {onVehicle(n.itemId) ? ` · ${onVehicle(n.itemId)} already on board` : ""}
                  </span>
                </span>
                <Input type="number" inputMode="numeric" className="h-12 w-24 text-right text-lg font-semibold tabular" value={qty?.[n.itemId] ?? n.quantity} onChange={(e) => setQty({ ...(qty ?? {}), [n.itemId]: Number(e.target.value) })} />
              </li>
            ))}
          </ul>
        )}
      </Screen>
      <PrimaryActionBar>
        <Button className="h-14 w-full text-lg" disabled={!allTicked || busy} onClick={() => void start()}>
          {t("driver.startRoute")} <Check className="size-5" />
        </Button>
      </PrimaryActionBar>
    </>
  )
}

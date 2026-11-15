import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Flag, Check, Clock } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useUser } from "@/lib/auth"
import { useRoute, useStock } from "@/lib/queries"
import type { RequestRow } from "@/lib/types"
import { formatRs, formatRsShort, uuid } from "@/lib/utils"
import { PhoneHeader, Screen, PrimaryActionBar } from "@/components/frames"
import { SyncChip, UserMenu, ToneBadge } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

/** Return check + cash handover (spec §11.6). */
export function DriverEndOfDay() {
  const user = useUser()
  const qc = useQueryClient()
  const route = useRoute(undefined, user.id)
  const stock = useStock()
  const [busy, setBusy] = React.useState(false)
  const handover = useQuery({
    queryKey: ["my-handover"],
    queryFn: () => api.get<RequestRow[]>("/requests/inbox?tab=all").then((rs) => rs.find((r) => r.type === "CASH_HANDOVER" && r.fromPartyId === user.partyId) ?? null),
    refetchInterval: 15_000,
  })
  const leftover = (stock.data?.cells ?? []).filter((c) => c.holderId === user.partyId && c.quantity > 0)
  const cheques = useQuery({ queryKey: ["my-cheques"], queryFn: () => api.get<{ amountCents: number }[]>(`/movements?partyId=${user.partyId}&kind=MONEY&limit=50`).then((ms) => (ms as unknown as { amountCents: number; method: string; toPartyId: string; occurredAt: string }[]).filter((m) => m.method === "CHEQUE" && m.toPartyId === user.partyId && new Date(m.occurredAt).toDateString() === new Date().toDateString())) })
  const chequeTotal = (cheques.data ?? []).reduce((s, c) => s + c.amountCents, 0)
  const cash = route.data?.cashCents ?? 0
  const remaining = (route.data?.stops ?? []).filter((s) => s.status !== "DONE" && s.stopStatus !== "SKIPPED").length

  const end = async () => {
    setBusy(true)
    try {
      if (leftover.length) await api.post("/movements/unload", { clientId: uuid() })
      await api.post("/requests/end-of-day")
      toast.success("Goods returned and handover requested. The office will count and confirm.")
      void qc.invalidateQueries()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PhoneHeader
        title="End of day"
        right={
          <div className="flex items-center gap-1">
            <SyncChip />
            <UserMenu compact />
          </div>
        }
      />
      <Screen>
        {remaining > 0 ? <ToneBadge tone="amber">{remaining} stop{remaining > 1 ? "s" : ""} not done yet</ToneBadge> : <ToneBadge tone="green">All stops done</ToneBadge>}

        <Card size="sm" className="gap-2 px-3">
          <h2 className="font-semibold">Return check</h2>
          {leftover.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing left on the vehicle.</p>
          ) : (
            <ul className="text-sm">
              {leftover.map((c) => (
                <li key={c.itemId} className="flex justify-between py-0.5">
                  <span>{stock.data?.items.find((i) => i.id === c.itemId)?.name}</span>
                  <span className="font-semibold tabular">{c.quantity}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Goes back to the warehouse when you end the day.</p>
        </Card>

        <Card size="sm" className="gap-2 px-3">
          <h2 className="font-semibold">Cash handover</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted p-3">
              <div className="text-xs text-muted-foreground">Cash expected</div>
              <div className="text-xl font-bold tabular">{formatRs(cash)}</div>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <div className="text-xs text-muted-foreground">Cheques today</div>
              <div className="text-xl font-bold tabular">{formatRsShort(chequeTotal)}</div>
            </div>
          </div>
          {handover.data ? (
            handover.data.status === "DONE" ? (
              <ToneBadge tone="green">
                <Check className="size-3" /> Handover accepted
              </ToneBadge>
            ) : (
              <ToneBadge tone="blue">
                <Clock className="size-3" /> Waiting for the office to count
              </ToneBadge>
            )
          ) : null}
        </Card>
      </Screen>
      <PrimaryActionBar>
        <Button className="h-14 w-full text-lg" disabled={busy || Boolean(handover.data && handover.data.status === "PROPOSED")} onClick={() => void end()}>
          <Flag className="size-5" /> {handover.data?.status === "PROPOSED" ? "Handover requested" : `End route · hand over ${formatRsShort(cash)}`}
        </Button>
      </PrimaryActionBar>
    </>
  )
}

import * as React from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Check, CalendarClock, ArrowUpRight, Phone } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useMyWork, keys } from "@/lib/queries"
import type { RequestRow } from "@/lib/types"
import { formatDay, telHref } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, ListSkeleton, TypeBadge } from "@/components/common"

/** Tasks the owner assigned to this staff member (spec §9.9). */
export function OfficeTasks() {
  const work = useMyWork()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [callBack, setCallBack] = React.useState<Record<string, string>>({})

  const outcome = async (r: RequestRow, kind: "done" | "callback" | "owner") => {
    try {
      if (kind === "done") {
        await api.post(`/requests/${r.id}/finish`, { note: "Done" })
      } else if (kind === "callback") {
        const d = callBack[r.id]
        if (!d) return toast.error("Pick a date")
        await api.post("/notes", { partyId: r.toPartyId ?? r.fromPartyId, channel: "CALL", text: `Call back on ${formatDay(d)}` })
        await api.post(`/requests/${r.id}/finish`, { note: `Call back on ${formatDay(d)}` })
        const n = await api.post<RequestRow>("/requests", { type: "CALL_TASK", toPartyId: r.toPartyId, fromPartyId: r.fromPartyId, assignedToId: r.assignedToId, dueAt: d, reason: r.reason, lines: [] })
        await api.post(`/requests/${n.id}/decide`, { action: "APPROVE" })
      } else {
        await api.post(`/requests/${r.id}/decide`, { action: "SEND_TO_OWNER", note: "Needs owner" }).catch(() => null)
        await api.post("/notes", { partyId: r.toPartyId ?? r.fromPartyId, channel: "CALL", text: `Needs owner: ${r.reason ?? ""}` })
        await api.post(`/requests/${r.id}/finish`, { note: "Needs owner" })
      }
      toast.success("Saved")
      void qc.invalidateQueries({ queryKey: keys.myWork })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My tasks</h1>
      {work.isLoading ? (
        <ListSkeleton />
      ) : !work.data?.length ? (
        <EmptyState title="No tasks right now" hint="Tasks the owner assigns to you appear here with the contact's history." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {work.data.map((r) => {
            const party = r.toParty ?? r.fromParty
            return (
              <Card key={r.id} size="sm" className="gap-2 px-3">
                <div className="flex items-center justify-between gap-2">
                  <TypeBadge type={r.type} />
                  <span className="text-xs text-muted-foreground">due {r.dueAt ? formatDay(r.dueAt) : "—"}</span>
                </div>
                <button type="button" className="text-left font-semibold hover:underline" onClick={() => navigate(`/office/directory/${party?.id}`)}>
                  {party?.name}
                </button>
                <p className="text-sm text-muted-foreground">{r.reason}</p>
                {r.decisionNote ? <p className="text-xs text-muted-foreground">From owner: {r.decisionNote}</p> : null}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {party?.phone ? (
                    <Button asChild size="sm">
                      <a href={telHref(party.phone)}>
                        <Phone className="size-3.5" /> Call
                      </a>
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => void outcome(r, "done")}>
                    <Check className="size-3.5" /> Done
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void outcome(r, "owner")}>
                    <ArrowUpRight className="size-3.5" /> Needs owner
                  </Button>
                  <div className="flex items-center gap-1">
                    <Input type="date" className="h-7 w-36 text-xs" value={callBack[r.id] ?? ""} onChange={(e) => setCallBack({ ...callBack, [r.id]: e.target.value })} />
                    <Button size="sm" variant="ghost" onClick={() => void outcome(r, "callback")}>
                      <CalendarClock className="size-3.5" /> Call back
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

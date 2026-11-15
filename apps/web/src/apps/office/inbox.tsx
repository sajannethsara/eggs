import * as React from "react"
import { useTranslation } from "react-i18next"
import { Bot, User as UserIcon, Inbox as InboxIcon } from "lucide-react"
import { toast } from "sonner"
import { useInbox, useDecide, useRequest } from "@/lib/queries"
import { useUser } from "@/lib/auth"
import type { RequestRow } from "@/lib/types"
import { cn, formatDay, formatRsShort } from "@/lib/utils"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EmptyState, ListSkeleton, TypeBadge, StatusBadge, HelpButton } from "@/components/common"
import { RequestCard, requestTitle, requestValue, RejectDialog, LinesSummary } from "@/components/request-card"
import { PartyProfile } from "@/components/party-profile"

/** Review queue with keyboard: A approve · E edit · R reject · ↓ next (spec §9.2). */
export function OfficeInbox() {
  const { t } = useTranslation()
  const user = useUser()
  const [tab, setTab] = React.useState<"mine" | "owner" | "all">("mine")
  const inbox = useInbox(tab)
  const decide = useDecide()
  const rows = React.useMemo(() => inbox.data ?? [], [inbox.data])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [rejecting, setRejecting] = React.useState(false)
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null
  const detail = useRequest(selected?.id ?? null)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) return
      if (!selected) return
      const idx = rows.findIndex((r) => r.id === selected.id)
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault()
        setSelectedId(rows[Math.min(rows.length - 1, idx + 1)]?.id ?? null)
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault()
        setSelectedId(rows[Math.max(0, idx - 1)]?.id ?? null)
      } else if (e.key.toLowerCase() === "a" && tab === "mine") {
        decide.mutate({ id: selected.id, decision: { action: "APPROVE" } }, { onSuccess: () => toast.success("Approved"), onError: (err) => toast.error(err.message) })
      } else if (e.key.toLowerCase() === "r" && tab === "mine") {
        setRejecting(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [rows, selected, tab, decide])

  return (
    <div className="grid h-[calc(100svh-5.5rem)] grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{t("nav.office.inbox")}</h1>
          <HelpButton title="Inbox" steps={["Each row: what, why, money impact, who proposed it, and age.", "Keyboard: A approve · E edit · R reject · ↓ next.", "The right panel shows the full request with the contact's history.", "Over your limit? Send to owner moves it to the owner's Approve tab."]} />
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="mine">For me</TabsTrigger>
            <TabsTrigger value="owner">Waiting on owner</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {inbox.isLoading ? (
            <ListSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState icon={InboxIcon} title="Inbox is clear" hint="Rules and calls add proposals here. Use F2 to capture a call." />
          ) : (
            rows.map((r) => <InboxRow key={r.id} r={r} selected={selected?.id === r.id} onSelect={() => setSelectedId(r.id)} />)
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          <kbd className="rounded border px-1">A</kbd> approve · <kbd className="rounded border px-1">R</kbd> reject · <kbd className="rounded border px-1">↓</kbd> next
        </p>
      </section>

      <section className="hidden min-h-0 overflow-y-auto lg:block">
        {selected ? (
          <div className="space-y-4">
            <RequestCard r={(detail.data as RequestRow | undefined) ?? selected} canSendToOwner={user.role === "OFFICE"} />
            {detail.data?.events?.length ? (
              <Card size="sm" className="px-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h3>
                <ul className="space-y-1 text-sm">
                  {detail.data.events.map((e) => (
                    <li key={e.id} className="flex justify-between gap-2">
                      <span>
                        <span className="font-medium capitalize">{e.action.toLowerCase().replace(/_/g, " ")}</span>
                        {e.by ? ` · ${e.by.displayName}` : " · rule"}
                        {e.note ? <span className="text-muted-foreground"> — {e.note}</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDay(e.at)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {(selected.toPartyId ?? selected.fromPartyId) ? <PartyProfile id={(selected.toPartyId ?? selected.fromPartyId)!} /> : null}
          </div>
        ) : (
          <EmptyState title="Select a request" />
        )}
      </section>

      {selected ? <RejectDialog open={rejecting} onOpenChange={setRejecting} onConfirm={(reason, note) => decide.mutate({ id: selected.id, decision: { action: "REJECT", rejectReason: reason, note } }, { onSuccess: () => toast.success("Rejected") })} /> : null}
    </div>
  )
}

function InboxRow({ r, selected, onSelect }: { r: RequestRow; selected: boolean; onSelect: () => void }) {
  const [now] = React.useState(() => Date.now())
  const age = Math.round((now - new Date(r.createdAt).getTime()) / 3_600_000)
  const value = requestValue(r)
  return (
    <button type="button" onClick={onSelect} className={cn("w-full rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/60", selected && "border-primary ring-2 ring-primary/40")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <TypeBadge type={r.type} />
          {r.escalated ? <StatusBadge status="PROPOSED" /> : null}
        </div>
        <span className="text-xs text-muted-foreground tabular">{age < 1 ? "just now" : age < 24 ? `${age}h` : `${Math.round(age / 24)}d`}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="truncate font-medium">{requestTitle(r)}</span>
        {value ? <span className="shrink-0 font-semibold tabular">{formatRsShort(value)}</span> : null}
      </div>
      {r.reason ? <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{r.reason}</p> : null}
      <LinesSummary r={r} className="mt-1 text-xs text-muted-foreground" />
      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        {r.createdByRule ? <Bot className="size-3" /> : <UserIcon className="size-3" />}
        {r.createdByRule ? r.createdByRule.toLowerCase().replace(/_/g, " ") : r.createdBy?.displayName}
      </div>
    </button>
  )
}

export function InlineDecide({ r }: { r: RequestRow }) {
  const decide = useDecide()
  return (
    <Button size="sm" onClick={() => decide.mutate({ id: r.id, decision: { action: "APPROVE" } })}>
      Approve
    </Button>
  )
}

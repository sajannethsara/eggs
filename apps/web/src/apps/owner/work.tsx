import * as React from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Phone, Plus, Lock, UserPlus, Check } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useMyWork, useDelegated, useParties, keys } from "@/lib/queries"
import type { RequestRow, Party } from "@/lib/types"
import { cn, formatDay, telHref } from "@/lib/utils"
import { PhoneHeader, Screen } from "@/components/frames"
import { SyncChip, UserMenu, EmptyState, ListSkeleton, StatusBadge, HelpButton } from "@/components/common"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const OUTCOMES = ["Ordered", "Price changed", "Call back", "No answer", "Issue"] as const

export function OwnerWork() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const work = useMyWork()
  const delegated = useDelegated()
  const [tab, setTab] = React.useState<"mine" | "staff">("mine")
  const [after, setAfter] = React.useState<RequestRow | null>(null)
  const [newTask, setNewTask] = React.useState(false)
  const [reassign, setReassign] = React.useState<RequestRow | null>(null)
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.myWork })
    void qc.invalidateQueries({ queryKey: keys.delegated })
  }

  return (
    <>
      <PhoneHeader
        title={t("nav.owner.work")}
        subtitle="Your calls, and what you handed to staff"
        right={
          <div className="flex items-center gap-1">
            <SyncChip />
            <HelpButton title="Work to do" steps={["My calls are contacts only you handle.", "Tap Call, then pick what happened.", "Give a task to staff with + New task; owner-only contacts ask you to confirm.", "Assigned tasks show the staff member's notes when done."]} />
            <UserMenu compact />
          </div>
        }
      />
      <Screen>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="mine" className="flex-1">
              My calls today
            </TabsTrigger>
            <TabsTrigger value="staff" className="flex-1">
              Assigned to staff
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "mine" ? (
          work.isLoading ? (
            <ListSkeleton />
          ) : !work.data?.length ? (
            <EmptyState icon={Phone} title="No calls waiting" hint="Rules add calls here on usual order days, when a big customer goes quiet, or for supplier price checks." />
          ) : (
            <div className="space-y-2">
              {work.data.map((r) => {
                const party = r.toParty ?? r.fromParty
                return (
                  <Card key={r.id} size="sm" className="gap-1.5 px-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-semibold">
                          {party?.contactTier === "OWNER_ONLY" ? <Lock className="size-3.5 text-muted-foreground" /> : null}
                          <span className="truncate">{party?.name}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{r.reason}</p>
                        {party?.health?.daysSinceContact != null ? <p className="text-xs text-muted-foreground">Last contact {party.health.daysSinceContact} days ago</p> : null}
                      </div>
                      <Button variant="ghost" size="icon-sm" aria-label="Give to…" onClick={() => setReassign(r)}>
                        <UserPlus className="size-4" />
                      </Button>
                    </div>
                    <Button asChild className="h-12 w-full text-base" onClick={() => setTimeout(() => setAfter(r), 400)}>
                      <a href={telHref(party?.phone) ?? "#"}>
                        <Phone className="size-5" />
                        {t("common.call")} {party?.phone ?? ""}
                      </a>
                    </Button>
                  </Card>
                )
              })}
            </div>
          )
        ) : delegated.isLoading ? (
          <ListSkeleton />
        ) : !delegated.data?.length ? (
          <EmptyState icon={UserPlus} title="Nothing assigned" hint="Use + New task to hand a call or follow-up to office staff." />
        ) : (
          <div className="space-y-2">
            {delegated.data.map((r) => (
              <Card key={r.id} size="sm" className="gap-1 px-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{(r.toParty ?? r.fromParty)?.name}</span>
                  <StatusBadge status={r.status === "DONE" ? "DONE" : r.escalated ? "PROPOSED" : "IN_PROGRESS"} />
                </div>
                <p className="text-sm text-muted-foreground">{r.reason}</p>
                <p className="text-xs text-muted-foreground">
                  {r.assignedTo?.displayName} · due {r.dueAt ? formatDay(r.dueAt) : "—"}
                  {r.decisionNote ? ` · ${r.decisionNote}` : ""}
                </p>
              </Card>
            ))}
          </div>
        )}

        <Button variant="outline" className="h-12 w-full" onClick={() => setNewTask(true)}>
          <Plus className="size-5" />+ New task
        </Button>
      </Screen>

      <AfterCallSheet r={after} onClose={() => setAfter(null)} onDone={refresh} />
      <NewTaskDialog open={newTask} onOpenChange={setNewTask} onDone={refresh} />
      <ReassignDialog r={reassign} onClose={() => setReassign(null)} onDone={refresh} />
    </>
  )
}

/** Bottom sheet after a call: outcome chips, note, optional follow-up (spec §8.3). */
function AfterCallSheet({ r, onClose, onDone }: { r: RequestRow | null; onClose: () => void; onDone: () => void }) {
  return (
    <Sheet open={Boolean(r)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        {/* Keyed on the request so the outcome and note start fresh for every call. */}
        {r ? <AfterCallBody key={r.id} r={r} onClose={onClose} onDone={onDone} /> : null}
      </SheetContent>
    </Sheet>
  )
}

function AfterCallBody({ r, onClose, onDone }: { r: RequestRow; onClose: () => void; onDone: () => void }) {
  const [outcome, setOutcome] = React.useState<string>("")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const party = r.toParty ?? r.fromParty

  const finish = async () => {
    setBusy(true)
    try {
      await api.post("/notes", { partyId: party?.id, channel: "CALL", text: `${outcome || "Called"}${note ? `: ${note}` : ""}` })
      if (outcome === "Call back") {
        // keep the task open; just log the note
      } else {
        await api.post(`/requests/${r.id}/finish`, { note: outcome })
      }
      toast.success("Logged")
      onDone()
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
        <SheetHeader>
          <SheetTitle>How did it go with {party?.name}?</SheetTitle>
          <SheetDescription>Pick an outcome and add a note if needed.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            {OUTCOMES.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOutcome(o)}
                className={cn("min-h-11 rounded-full border px-4 text-sm font-medium transition-colors", outcome === o ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
              >
                {o}
              </button>
            ))}
          </div>
          <Textarea placeholder="Note (voice-to-text works with the keyboard mic)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button className="h-12 w-full text-base" disabled={!outcome || busy} onClick={() => void finish()}>
            <Check className="size-5" />
            Done
          </Button>
        </div>
    </>
  )
}

function useOfficeStaff() {
  return useQuery({
    queryKey: ["office-staff"],
    queryFn: async () => {
      // Parties of type EMPLOYEE with an office user are the assignees; we need user ids, so use a small lookup.
      const users = await api.get<{ id: string; displayName: string; role: string }[]>("/parties?type=EMPLOYEE").then((ps) =>
        (ps as unknown as (Party & { user?: { id: string; role: string } })[]).filter((p) => p.user && (p.user.role === "OFFICE" || p.user.role === "OWNER")).map((p) => ({ id: p.user!.id, displayName: p.name, role: p.user!.role }))
      )
      return users
    },
  })
}

/** Four taps and an optional note (spec §8.3). */
function NewTaskDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [q, setQ] = React.useState("")
  const parties = useParties({ q })
  const staff = useOfficeStaff()
  const [partyId, setPartyId] = React.useState("")
  const [type, setType] = React.useState<"CALL_TASK" | "COLLECTION">("CALL_TASK")
  const [assignee, setAssignee] = React.useState("")
  const [due, setDue] = React.useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const party = parties.data?.find((p) => p.id === partyId)

  const submit = async () => {
    setBusy(true)
    try {
      const r = await api.post<RequestRow>("/requests", { type, toPartyId: partyId, assignedToId: assignee, dueAt: due, reason: note || (type === "CALL_TASK" ? "Call" : "Collect"), lines: [] })
      await api.post(`/requests/${r.id}/decide`, { action: "APPROVE" })
      toast.success("Task assigned")
      onDone()
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
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Pick a contact, a task type, the staff member and a due date.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Contact</Label>
            <Input placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-36 overflow-y-auto rounded-lg border">
              {(parties.data ?? []).filter((p) => p.type === "CUSTOMER" || p.type === "SUPPLIER").slice(0, 8).map((p) => (
                <button key={p.id} type="button" onClick={() => setPartyId(p.id)} className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent", partyId === p.id && "bg-primary/10 font-medium")}>
                  {p.contactTier === "OWNER_ONLY" ? <Lock className="size-3.5 text-muted-foreground" /> : null}
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Task</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CALL_TASK">Call / follow up</SelectItem>
                  <SelectItem value="COLLECTION">Collect payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Staff</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick" />
                </SelectTrigger>
                <SelectContent>
                  {(staff.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="due">Due</Label>
            <Input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <Textarea placeholder="Instructions" value={note} onChange={(e) => setNote(e.target.value)} />
          {party?.contactTier === "OWNER_ONLY" ? (
            <p className="flex items-center gap-1.5 text-sm text-amber-800 dark:text-status-amber">
              <Lock className="size-4" /> This is an owner-only contact. Assigning it is deliberate.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={!partyId || !assignee || busy} className="h-11">
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReassignDialog({ r, onClose, onDone }: { r: RequestRow | null; onClose: () => void; onDone: () => void }) {
  const staff = useOfficeStaff()
  const [assignee, setAssignee] = React.useState("")
  const party = r?.toParty ?? r?.fromParty
  const submit = async () => {
    if (!r) return
    try {
      await api.patch(`/requests/${r.id}/assign`, { assignedToId: assignee })
      toast.success("Given to staff")
      onDone()
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <Dialog open={Boolean(r)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Give to…</DialogTitle>
          <DialogDescription>
            {party?.contactTier === "OWNER_ONLY" ? "This is an owner-only contact. " : ""}
            Choose who should make this call.
          </DialogDescription>
        </DialogHeader>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pick a staff member" />
          </SelectTrigger>
          <SelectContent>
            {(staff.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={!assignee}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

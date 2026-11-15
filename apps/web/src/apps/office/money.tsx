import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Phone, MessageCircle, Landmark, CheckCircle2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { cn, formatRsShort, formatDay, telHref, waHref } from "@/lib/utils"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ListSkeleton, ToneBadge, EmptyState } from "@/components/common"

type Receivables = { rows: { party: { id: string; name: string; phone: string | null; whatsapp: string | null; creditDays: number }; balanceCents: number; oldestDays: number; bucket: string }[]; totals: Record<string, number> }
type Cheque = { id: string; chequeNumber: string | null; chequeBank: string | null; chequeDate: string | null; chequeStatus: string | null; amountCents: number; fromParty: { name: string }; toParty: { name: string } }

/** Receivables, cheques, payables (spec §9.7). */
export function OfficeMoney() {
  const [tab, setTab] = React.useState<"receivables" | "cheques" | "payables">("receivables")
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Money</h1>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="receivables">Receivables</TabsTrigger>
            <TabsTrigger value="cheques">Cheques</TabsTrigger>
            <TabsTrigger value="payables">Payables</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {tab === "receivables" ? <ReceivablesTab /> : tab === "cheques" ? <ChequesTab /> : <PayablesTab />}
    </div>
  )
}

function ReceivablesTab() {
  const rec = useQuery({ queryKey: ["receivables"], queryFn: () => api.get<Receivables>("/views/receivables") })
  if (rec.isLoading || !rec.data) return <ListSkeleton />
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {(["0-30", "31-60", "60+"] as const).map((b) => (
          <Card key={b} size="sm" className="gap-0.5 px-3">
            <div className="text-xs text-muted-foreground">{b} days</div>
            <div className={cn("text-lg font-semibold tabular", b === "60+" && rec.data!.totals[b] > 0 && "text-status-red")}>{formatRsShort(rec.data!.totals[b])}</div>
          </Card>
        ))}
      </div>
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Age</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rec.data.rows.map((r) => (
              <TableRow key={r.party.id}>
                <TableCell className="font-medium">{r.party.name}</TableCell>
                <TableCell className="text-right font-semibold tabular">{formatRsShort(r.balanceCents)}</TableCell>
                <TableCell>
                  <ToneBadge tone={r.bucket === "60+" ? "red" : r.bucket === "31-60" ? "amber" : "green"}>
                    {r.oldestDays}d · {r.bucket}
                  </ToneBadge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button asChild size="sm" variant="outline">
                      <a href={telHref(r.party.phone)}>
                        <Phone className="size-3.5" /> Call
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a href={waHref(r.party.whatsapp ?? r.party.phone, `Hello ${r.party.name}, a friendly reminder: your balance with AK Enterprises is ${formatRsShort(r.balanceCents)}. Thank you.`)} target="_blank" rel="noreferrer">
                        <MessageCircle className="size-3.5" /> Send reminder
                      </a>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">Send reminder opens WhatsApp with the message filled in, so you check it before sending.</p>
    </div>
  )
}

function ChequesTab() {
  const qc = useQueryClient()
  const [now] = React.useState(() => Date.now())
  const cheques = useQuery({ queryKey: ["cheques", "all"], queryFn: () => api.get<Cheque[]>("/views/cheques") })
  const set = async (id: string, status: "DEPOSITED" | "CLEARED" | "BOUNCED") => {
    await api.patch(`/movements/${id}/cheque`, { status })
    toast.success(`Marked ${status.toLowerCase()}`)
    void qc.invalidateQueries({ queryKey: ["cheques"] })
  }
  if (cheques.isLoading) return <ListSkeleton />
  const rows = [...(cheques.data ?? [])].sort((a, b) => (a.chequeStatus === "PENDING" ? -1 : 1) - (b.chequeStatus === "PENDING" ? -1 : 1))
  if (!rows.length) return <EmptyState title="No cheques" />
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>From</TableHead>
            <TableHead>Cheque</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => {
            const due = c.chequeDate ? new Date(c.chequeDate) : null
            const soon = due && c.chequeStatus === "PENDING" && due.getTime() - now < 2 * 86_400_000
            return (
              <TableRow key={c.id}>
                <TableCell className={cn("tabular", soon && "font-semibold text-amber-700")}>{due ? formatDay(due) : "—"}</TableCell>
                <TableCell className="font-medium">{c.fromParty.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.chequeBank} #{c.chequeNumber}
                </TableCell>
                <TableCell className="text-right font-semibold tabular">{formatRsShort(c.amountCents)}</TableCell>
                <TableCell>
                  <ToneBadge tone={c.chequeStatus === "CLEARED" ? "green" : c.chequeStatus === "BOUNCED" ? "red" : c.chequeStatus === "DEPOSITED" ? "blue" : "amber"}>{c.chequeStatus?.toLowerCase()}</ToneBadge>
                </TableCell>
                <TableCell className="text-right">
                  {c.chequeStatus === "PENDING" ? (
                    <Button size="sm" variant="outline" onClick={() => void set(c.id, "DEPOSITED")}>
                      <Landmark className="size-3.5" /> Deposited
                    </Button>
                  ) : c.chequeStatus === "DEPOSITED" ? (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => void set(c.id, "CLEARED")}>
                        <CheckCircle2 className="size-3.5" /> Cleared
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => void set(c.id, "BOUNCED")}>
                        <XCircle className="size-3.5" /> Bounced
                      </Button>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function PayablesTab() {
  const pay = useQuery({ queryKey: ["payables"], queryFn: () => api.get<{ party: { id: string; name: string; usualDays: number[] }; payableCents: number }[]>("/views/payables") })
  if (pay.isLoading) return <ListSkeleton />
  if (!pay.data?.length) return <EmptyState title="Nothing owed to suppliers" />
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Supplier</TableHead>
            <TableHead className="text-right">We owe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pay.data.map((r) => (
            <TableRow key={r.party.id}>
              <TableCell className="font-medium">{r.party.name}</TableCell>
              <TableCell className="text-right font-semibold tabular">{formatRsShort(r.payableCents)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

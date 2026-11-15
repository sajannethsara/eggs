import { useInbox, useParties } from "@/lib/queries"
import { RequestCard } from "@/components/request-card"
import { EmptyState, ListSkeleton } from "@/components/common"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

/** Leave requests and the staff list (spec §9.8). Roster drag-and-drop is a later phase. */
export function OfficeStaff() {
  const inbox = useInbox("all")
  const staff = useParties({ type: "EMPLOYEE" })
  const leave = (inbox.data ?? []).filter((r) => r.type === "LEAVE" || r.type === "SHIFT")
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Staff</h1>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Leave requests</h2>
        {inbox.isLoading ? <ListSkeleton rows={1} /> : leave.length === 0 ? <EmptyState title="No leave waiting" hint="Leave on a busy day is marked 'leaves day short' with a suggested cover." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{leave.map((r) => <RequestCard key={r.id} r={r} />)}</div>}
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Employees</h2>
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(staff.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.phone ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  )
}

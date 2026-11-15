import * as React from "react"
import { useTranslation } from "react-i18next"
import { CheckCheck } from "lucide-react"
import { toast } from "sonner"
import { useOwnerQueue, useDecide } from "@/lib/queries"
import { PhoneHeader, Screen } from "@/components/frames"
import { SyncChip, UserMenu, EmptyState, ErrorState, ListSkeleton, HelpButton } from "@/components/common"
import { RequestCard } from "@/components/request-card"
import { Button } from "@/components/ui/button"

export function OwnerApprove() {
  const { t } = useTranslation()
  const queue = useOwnerQueue()
  const decide = useDecide()
  const [bulkBusy, setBulkBusy] = React.useState<string | null>(null)
  const total = queue.data?.reduce((s, g) => s + g.items.length, 0) ?? 0

  // Bulk approve routine purchases / transfers (spec §8.2).
  const approveAll = async (type: string, ids: string[]) => {
    setBulkBusy(type)
    let ok = 0
    for (const id of ids) {
      try {
        await decide.mutateAsync({ id, decision: { action: "APPROVE" } })
        ok++
      } catch (e) {
        toast.error((e as Error).message)
      }
    }
    toast.success(`Approved ${ok} of ${ids.length}`)
    setBulkBusy(null)
  }

  return (
    <>
      <PhoneHeader
        title={t("nav.owner.approve")}
        subtitle={total ? `${total} waiting for you` : "Nothing waiting"}
        right={
          <div className="flex items-center gap-1">
            <SyncChip />
            <HelpButton title="Approve" steps={["Each card says what, why and the money impact.", "Approve, edit the quantity then approve, or reject with a reason.", "Routine items like standard purchases can be approved all at once.", "Rejections are counted per rule so office staff can tune it."]} />
            <UserMenu compact />
          </div>
        }
      />
      <Screen>
        {queue.isError ? (
          <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
        ) : queue.isLoading ? (
          <ListSkeleton />
        ) : !queue.data?.length ? (
          <EmptyState icon={CheckCheck} title="All caught up" hint="New proposals from rules and staff will appear here." />
        ) : (
          queue.data.map((g) => (
            <section key={g.type} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`types.${g.type}`)} <span className="tabular">({g.items.length})</span>
                </h2>
                {g.items.length > 1 && (g.type === "PURCHASE" || g.type === "TRANSFER" || g.type === "SALE_ORDER") ? (
                  <Button size="sm" variant="outline" onClick={() => void approveAll(g.type, g.items.map((i) => i.id))} disabled={bulkBusy !== null}>
                    <CheckCheck className="size-3.5" />
                    Approve all {g.items.length}
                  </Button>
                ) : null}
              </div>
              {g.items.map((r) => (
                <RequestCard key={r.id} r={r} />
              ))}
            </section>
          ))
        )}
      </Screen>
    </>
  )
}

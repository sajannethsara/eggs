import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { Search, Lock, ArrowLeft } from "lucide-react"
import { useParties } from "@/lib/queries"
import { cn, formatRsShort } from "@/lib/utils"
import { PhoneHeader, Screen } from "@/components/frames"
import { SyncChip, UserMenu, ListSkeleton, EmptyState, HealthDot } from "@/components/common"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PartyProfile } from "@/components/party-profile"

const FILTERS = [
  { key: "big", label: "Big customers", params: { segment: "B2B_BIG" } },
  { key: "suppliers", label: "Suppliers", params: { type: "SUPPLIER" } },
  { key: "owner", label: "Owner-only", params: { tier: "OWNER_ONLY" } },
  { key: "overdue", label: "Overdue", params: { overdue: true } },
  { key: "red", label: "Red", params: { red: true } },
] as const

export function OwnerContacts() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const [q, setQ] = React.useState("")
  const [filter, setFilter] = React.useState<string | null>(sp.get("red") ? "red" : null)
  const params = FILTERS.find((f) => f.key === filter)?.params ?? {}
  const parties = useParties({ q, ...params })
  const list = (parties.data ?? []).filter((p) => p.type === "CUSTOMER" || p.type === "SUPPLIER")

  if (id) {
    return (
      <>
        <PhoneHeader
          title="Profile"
          left={
            <Button variant="ghost" size="icon" onClick={() => navigate("/owner/contacts")} aria-label="Back">
              <ArrowLeft className="size-5" />
            </Button>
          }
          right={<UserMenu compact />}
        />
        <Screen>
          <PartyProfile id={id} canEditTerms />
        </Screen>
      </>
    )
  }

  return (
    <>
      <PhoneHeader
        title={t("nav.owner.contacts")}
        right={
          <div className="flex items-center gap-1">
            <SyncChip />
            <UserMenu compact />
          </div>
        }
      />
      <Screen>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-11 pl-9 text-base" placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(filter === f.key ? null : f.key)}
              className={cn("min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors", filter === f.key ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}
            >
              {f.label}
            </button>
          ))}
        </div>
        {parties.isLoading ? (
          <ListSkeleton />
        ) : list.length === 0 ? (
          <EmptyState title="No contacts match" />
        ) : (
          <Card className="divide-y py-0">
            {list.map((p) => (
              <button key={p.id} type="button" onClick={() => navigate(`/owner/contacts/${p.id}`)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent">
                <HealthDot colour={p.health?.colour ?? "green"} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    {p.contactTier === "OWNER_ONLY" ? <Lock className="size-3.5 text-muted-foreground" /> : null}
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.type === "SUPPLIER" ? "Supplier" : p.segment === "B2B_BIG" ? "Big customer" : p.segment === "B2B_REGULAR" ? "Regular" : "Walk-in"}
                    {p.health?.daysSinceOrder != null ? ` · ${p.health.daysSinceOrder}d since order` : ""}
                  </span>
                </span>
                <span className={cn("text-sm font-semibold tabular", (p.balanceCents ?? 0) > 0 && p.health?.overdueCents ? "text-status-red" : "")}>{p.balanceCents ? formatRsShort(p.balanceCents) : ""}</span>
              </button>
            ))}
          </Card>
        )}
      </Screen>
    </>
  )
}

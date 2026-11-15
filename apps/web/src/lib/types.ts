// Response shapes from the API. Kept loose where the server returns Prisma rows.
import type { ContactTier, PartyType, PaymentMethod, RequestStatus, RequestType, Role, Segment, StopStatus } from "shared"

export type Item = {
  id: string
  name: string
  unit: string
  packSize: number
  packName: string | null
  category: string
  holdingDays: number
  perishable: boolean
  color: string
  posOrder: number | null
  active: boolean
  sellCents?: number | null
  buyCents?: number | null
  reorderLevels?: { holderId: string; quantity: number }[]
}

export type Health = {
  orderRhythm: "ok" | "slipped" | "na"
  payment: "ok" | "slipped" | "na"
  complaints: "ok" | "slipped" | "na"
  lastContact: "ok" | "slipped" | "na"
  colour: "green" | "amber" | "red"
  daysSinceOrder: number | null
  daysSinceContact: number | null
  returns90d: number
  overdueCents: number
}

export type Party = {
  id: string
  type: PartyType
  name: string
  phone: string | null
  whatsapp: string | null
  address: string | null
  landmark: string | null
  segment: Segment | null
  contactTier: ContactTier
  status: "ACTIVE" | "PAUSED" | "BLOCKED"
  creditLimitCents: number
  creditDays: number
  creditHold: boolean
  usualOrder: { itemId: string; quantity: number }[] | null
  usualDays: number[]
  windowStart: string | null
  windowEnd: string | null
  routeName: string | null
  routePosition: number | null
  systemCode: string | null
  balanceCents?: number
  health?: Health | null
}

export type RequestLine = { id: string; itemId: string; quantity: number; rateCents: number; item: Item }

export type UserRef = { id: string; displayName: string; role?: Role }

export type RequestRow = {
  id: string
  type: RequestType
  status: RequestStatus
  fromPartyId: string | null
  toPartyId: string | null
  fromParty: Party | null
  toParty: Party | null
  dueAt: string | null
  windowStart: string | null
  windowEnd: string | null
  assignedTo: UserRef | null
  assignedToId: string | null
  createdBy: UserRef | null
  createdByRule: string | null
  reason: string | null
  approvedBy: UserRef | null
  approvedAt: string | null
  rejectReason: string | null
  decisionNote: string | null
  escalated: boolean
  routePosition: number | null
  stopStatus: StopStatus | null
  stopProblem: string | null
  stopNote: string | null
  arrivedAt: string | null
  completedAt: string | null
  payload: Record<string, unknown> | null
  lines: RequestLine[]
  createdAt: string
  valueCents?: number
  paidCents?: number
  creditWarning?: boolean
  events?: { id: string; action: string; at: string; note: string | null; by: { displayName: string } | null }[]
  movements?: Movement[]
}

export type Movement = {
  id: string
  requestId: string | null
  kind: "GOODS" | "MONEY"
  fromPartyId: string
  toPartyId: string
  fromParty?: { id: string; name: string; type: PartyType }
  toParty?: { id: string; name: string; type: PartyType }
  itemId: string | null
  item?: Item | null
  quantity: number | null
  rateCents: number | null
  amountCents: number | null
  method: PaymentMethod | null
  chequeNumber: string | null
  chequeBank: string | null
  chequeDate: string | null
  chequeStatus: "PENDING" | "DEPOSITED" | "CLEARED" | "BOUNCED" | null
  signerName: string | null
  reason: string | null
  spoilageReason: string | null
  occurredAt: string
  by?: { id: string; displayName: string } | null
}

export type StockCell = {
  holderId: string
  itemId: string
  quantity: number
  oldestBatchAt: string | null
  freshness: "green" | "amber" | "red" | null
  agePercent: number | null
  belowReorder: boolean
  reorderLevel: number | null
}

export type StockView = {
  holders: { id: string; name: string; type: PartyType }[]
  items: Item[]
  cells: StockCell[]
}

export type OwnerToday = {
  date: string
  kpis: {
    salesTodayCents: number
    salesLastWeekCents: number
    collectedTodayCents: number
    dueTodayCents: number
    stockAlerts: number
    lateDeliveries: number
  }
  outlets: { id: string; name: string; salesCents: number; alerts: number }[]
  stockAlerts: (StockCell & { itemName: string })[]
  late: (RequestRow & { minutesLate: number })[]
  feed: Movement[]
}

export type RouteView = {
  driver: { id: string; displayName: string; partyId: string }
  cashCents: number
  stops: (RequestRow & { position: number; party: Party | null; todayCents: number; oldBalanceCents: number })[]
}

export type RoutePlan = {
  unassigned: RequestRow[]
  drivers: { id: string; displayName: string; partyId: string; stops: RequestRow[]; done: number; collectedCents: number }[]
  proposedAssignments?: { requestId: string; driverId: string; position: number }[]
}

export type PriceRow = {
  item: Item
  buyCents: number
  sellCents: number
  marginPercent: number | null
  history: { id: string; direction: "BUY" | "SELL"; priceCents: number; validFrom: string; sourceNote: string | null; enteredBy: { displayName: string } | null; approvedBy: { displayName: string } | null }[]
}

export type Profit = {
  revenueCents: number
  costCents: number
  lossCents: number
  profitCents: number
  byItem: { itemId: string; name: string; revenue: number; cost: number; quantity: number; profit: number }[]
  byOutlet: { holderId: string; revenue: number; cost: number; profit: number }[]
  lossByItem: { itemId: string; cents: number }[]
  lossBySupplier: { supplierId: string; cents: number }[]
  lossByHolder: { holderId: string; cents: number }[]
}

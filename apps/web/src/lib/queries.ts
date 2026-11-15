import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { RequestDecision } from "shared"
import { api, qs } from "./api"
import type { Item, Movement, OwnerToday, Party, PriceRow, Profit, RequestRow, RoutePlan, RouteView, StockView } from "./types"

export const keys = {
  items: (partyId?: string) => ["items", partyId ?? ""] as const,
  parties: (p: Record<string, unknown>) => ["parties", p] as const,
  party: (id: string) => ["party", id] as const,
  inbox: (tab: string) => ["inbox", tab] as const,
  ownerQueue: ["owner-queue"] as const,
  myWork: ["my-work"] as const,
  delegated: ["delegated"] as const,
  orders: (day?: string) => ["orders", day ?? ""] as const,
  route: (day?: string, driverId?: string) => ["route", day ?? "", driverId ?? ""] as const,
  routePlan: (day?: string) => ["route-plan", day ?? ""] as const,
  stock: ["stock"] as const,
  ownerToday: ["owner-today"] as const,
  rates: ["rates"] as const,
  profit: (from?: string, to?: string) => ["profit", from ?? "", to ?? ""] as const,
  movements: (p: Record<string, unknown>) => ["movements", p] as const,
  request: (id: string) => ["request", id] as const,
}

export const useItems = (partyId?: string) => useQuery({ queryKey: keys.items(partyId), queryFn: () => api.get<Item[]>(`/items${qs({ partyId })}`) })

export const useParties = (p: { type?: string; q?: string; tier?: string; segment?: string; overdue?: boolean; red?: boolean } = {}) =>
  useQuery({ queryKey: keys.parties(p), queryFn: () => api.get<Party[]>(`/parties${qs(p)}`) })

export const useParty = (id: string | null) =>
  useQuery({ queryKey: keys.party(id ?? ""), queryFn: () => api.get<Party & { timeline: { kind: "note" | "request" | "movement"; at: string; data: never }[] }>(`/parties/${id}`), enabled: Boolean(id) })

export const useInbox = (tab: "mine" | "owner" | "all") =>
  useQuery({ queryKey: keys.inbox(tab), queryFn: () => api.get<RequestRow[]>(`/requests/inbox?tab=${tab}`), refetchInterval: 20_000 })

export const useOwnerQueue = () =>
  useQuery({ queryKey: keys.ownerQueue, queryFn: () => api.get<{ type: string; items: RequestRow[] }[]>("/requests/owner-queue"), refetchInterval: 20_000 })

export const useMyWork = () => useQuery({ queryKey: keys.myWork, queryFn: () => api.get<RequestRow[]>("/requests/my-work"), refetchInterval: 30_000 })
export const useDelegated = () => useQuery({ queryKey: keys.delegated, queryFn: () => api.get<RequestRow[]>("/requests/delegated") })

export const useOrders = (day?: string, outletId?: string) =>
  useQuery({ queryKey: [...keys.orders(day), outletId ?? ""], queryFn: () => api.get<RequestRow[]>(`/requests/orders${qs({ day, outletId })}`), refetchInterval: 20_000 })

export const useRoute = (day?: string, driverId?: string) =>
  useQuery({ queryKey: keys.route(day, driverId), queryFn: () => api.get<RouteView>(`/requests/route${qs({ day, driverId })}`), refetchInterval: 30_000 })

export const useRoutePlan = (day?: string) =>
  useQuery({ queryKey: keys.routePlan(day), queryFn: () => api.get<RoutePlan>(`/requests/route-plan${qs({ day })}`), refetchInterval: 20_000 })

export const useStock = () => useQuery({ queryKey: keys.stock, queryFn: () => api.get<StockView>("/views/stock"), refetchInterval: 30_000 })
export const useOwnerToday = () => useQuery({ queryKey: keys.ownerToday, queryFn: () => api.get<OwnerToday>("/views/owner-today"), refetchInterval: 30_000 })
export const useRates = () => useQuery({ queryKey: keys.rates, queryFn: () => api.get<PriceRow[]>("/rates") })
export const useProfit = (from?: string, to?: string) => useQuery({ queryKey: keys.profit(from, to), queryFn: () => api.get<Profit>(`/views/profit${qs({ from, to })}`) })
export const useMovements = (p: { partyId?: string; requestId?: string; kind?: string; limit?: number }) =>
  useQuery({ queryKey: keys.movements(p), queryFn: () => api.get<Movement[]>(`/movements${qs(p)}`) })
export const useRequest = (id: string | null) =>
  useQuery({ queryKey: keys.request(id ?? ""), queryFn: () => api.get<RequestRow>(`/requests/${id}`), enabled: Boolean(id) })

/** Approve / reject / edit / send to owner, then refresh every list that could contain the request. */
export function useDecide() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: RequestDecision }) => api.post<RequestRow>(`/requests/${id}/decide`, decision),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["inbox"] })
      void qc.invalidateQueries({ queryKey: keys.ownerQueue })
      void qc.invalidateQueries({ queryKey: ["orders"] })
      void qc.invalidateQueries({ queryKey: keys.stock })
      void qc.invalidateQueries({ queryKey: keys.rates })
      void qc.invalidateQueries({ queryKey: ["route-plan"] })
      void qc.invalidateQueries({ queryKey: keys.ownerToday })
    },
  })
}

export function useInvalidateAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}

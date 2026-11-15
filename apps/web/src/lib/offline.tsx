import * as React from "react"
import Dexie, { type EntityTable } from "dexie"
import { useLiveQuery } from "dexie-react-hooks"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, ApiError } from "./api"

/** Offline outbox (spec §15): actions are saved on the device and sent, in order, when the signal returns. */
export type OutboxOp = {
  id?: number
  clientId: string
  kind: "POS_SALE" | "STOP_COMPLETE" | "MOVEMENT"
  body: unknown
  label: string
  createdAt: number
  attempts: number
  lastError?: string
}

class AkDb extends Dexie {
  outbox!: EntityTable<OutboxOp, "id">
  constructor() {
    super("ak-ops")
    this.version(1).stores({ outbox: "++id, clientId, kind, createdAt" })
  }
}
export const db = new AkDb()

export async function enqueue(op: Omit<OutboxOp, "id" | "createdAt" | "attempts">) {
  await db.outbox.add({ ...op, createdAt: Date.now(), attempts: 0 })
}

let flushing = false
export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  if (flushing || !navigator.onLine) return { sent: 0, failed: 0 }
  flushing = true
  let sent = 0
  let failed = 0
  try {
    const ops = await db.outbox.orderBy("createdAt").toArray()
    if (!ops.length) return { sent, failed }
    const res = await api.post<{ results: { clientId: string; ok: boolean; error?: string }[] }>("/movements/sync", {
      ops: ops.map((o) => ({ clientId: o.clientId, kind: o.kind, body: o.body })),
    })
    for (const r of res.results) {
      const op = ops.find((o) => o.clientId === r.clientId)
      if (!op) continue
      if (r.ok) {
        await db.outbox.delete(op.id!)
        sent++
      } else {
        failed++
        await db.outbox.update(op.id!, { attempts: op.attempts + 1, lastError: r.error })
        // A permanent rejection (validation, forbidden) should not block the queue forever.
        if (op.attempts + 1 >= 3) {
          await db.outbox.delete(op.id!)
          toast.error(`Could not send "${op.label}": ${r.error ?? "rejected"}`)
        }
      }
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { sent, failed }
    // Network: keep everything queued.
  } finally {
    flushing = false
  }
  return { sent, failed }
}

type OfflineState = { online: boolean; pending: number; lastSyncAt: Date | null; flush: () => Promise<void> }
const OfflineContext = React.createContext<OfflineState | undefined>(undefined)

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = React.useState(navigator.onLine)
  const [lastSyncAt, setLastSyncAt] = React.useState<Date | null>(null)
  const pending = useLiveQuery(() => db.outbox.count(), [], 0)
  const qc = useQueryClient()

  const flush = React.useCallback(async () => {
    const { sent } = await flushOutbox()
    if (sent > 0) {
      setLastSyncAt(new Date())
      await qc.invalidateQueries()
      toast.success(`Sent ${sent} saved action${sent === 1 ? "" : "s"}`)
    }
  }, [qc])

  React.useEffect(() => {
    const up = () => {
      setOnline(true)
      void flush()
    }
    const down = () => setOnline(false)
    window.addEventListener("online", up)
    window.addEventListener("offline", down)
    const t = setInterval(() => void flush(), 30_000)
    void flush()
    return () => {
      window.removeEventListener("online", up)
      window.removeEventListener("offline", down)
      clearInterval(t)
    }
  }, [flush])

  const value = React.useMemo(() => ({ online, pending: pending ?? 0, lastSyncAt, flush }), [online, pending, lastSyncAt, flush])
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
}

export function useOffline() {
  const ctx = React.useContext(OfflineContext)
  if (!ctx) throw new Error("useOffline must be used within OfflineProvider")
  return ctx
}

/**
 * Run an action now if online; otherwise queue it. Returns { queued: true } when saved for later.
 * `label` is shown to the user if the server later rejects it.
 */
export async function runOrQueue<T>(
  op: { clientId: string; kind: OutboxOp["kind"]; body: unknown; label: string },
  send: () => Promise<T>
): Promise<{ queued: boolean; result?: T }> {
  if (!navigator.onLine) {
    await enqueue(op)
    return { queued: true }
  }
  try {
    return { queued: false, result: await send() }
  } catch (e) {
    // Network failure while "online": queue it. Server rejections (4xx) bubble up.
    if (e instanceof ApiError) throw e
    await enqueue(op)
    return { queued: true }
  }
}

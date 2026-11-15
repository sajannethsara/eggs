import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Check, Minus, Plus, Banknote, FileText, CreditCard, SplitSquareHorizontal, AlertTriangle, Phone, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import type { StopProblem } from "shared"
import { api, ApiError } from "@/lib/api"
import { useUser } from "@/lib/auth"
import { useRoute } from "@/lib/queries"
import { runOrQueue } from "@/lib/offline"
import { cn, formatRs, formatRsShort, uuid, telHref } from "@/lib/utils"
import { PhoneHeader, Screen, PrimaryActionBar } from "@/components/frames"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ListSkeleton, ToneBadge } from "@/components/common"
import { SignaturePad } from "@/components/signature-pad"

type Step = "items" | "pay" | "sign" | "done"
type Method = "CASH" | "CHEQUE" | "CREDIT" | "PART"

/** Confirm items → payment → signature → done (spec §11.3 / §11.4). */
export function DriverStop() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const user = useUser()
  const qc = useQueryClient()
  const route = useRoute(undefined, user.id)
  const stop = route.data?.stops.find((s) => s.id === id)
  const [step, setStep] = React.useState<Step>("items")
  const [qty, setQty] = React.useState<Record<string, number>>({})
  const [method, setMethod] = React.useState<Method | null>(null)
  const [received, setReceived] = React.useState("")
  const [cheque, setCheque] = React.useState({ number: "", bank: "", date: new Date().toISOString().slice(0, 10) })
  const [signer, setSigner] = React.useState("")
  const [signature, setSignature] = React.useState<string | null>(null)
  const [problem, setProblem] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [queued, setQueued] = React.useState(false)
  const [creditBlocked, setCreditBlocked] = React.useState<string | null>(null)

  if (route.isLoading) return <ListSkeleton className="p-4" />
  if (!stop) return <div className="p-6 text-muted-foreground">Stop not found. <Button variant="link" onClick={() => navigate("/driver")}>Back</Button></div>

  const isDelivery = stop.type === "SALE_ORDER"
  const lines = stop.lines.map((l) => ({ ...l, quantity: qty[l.itemId] ?? l.quantity }))
  const total = lines.reduce((s, l) => s + l.quantity * l.rateCents, 0)
  const receivedCents = received ? Math.round(Number(received) * 100) : total
  const party = stop.party

  const arrive = async () => {
    if (stop.status === "APPROVED") await api.post(`/requests/${stop.id}/start`).catch(() => null)
  }

  const submit = async () => {
    if (!method || !signature || !signer) return
    setBusy(true)
    const body = {
      requestId: stop.id,
      clientId: uuid(),
      lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, rateCents: l.rateCents })),
      method,
      receivedCents: method === "CASH" || method === "PART" ? receivedCents : undefined,
      chequeNumber: method === "CHEQUE" ? cheque.number : undefined,
      chequeBank: method === "CHEQUE" ? cheque.bank : undefined,
      chequeDate: method === "CHEQUE" ? cheque.date : undefined,
      signerName: signer,
      signatureDataUrl: signature,
      occurredAt: new Date().toISOString(),
    }
    try {
      const res = await runOrQueue({ clientId: body.clientId, kind: "STOP_COMPLETE", body, label: `${party?.name} ${formatRsShort(total)}` }, () => api.post(`/movements/stops/${stop.id}/complete`, body))
      setQueued(res.queued)
      setStep("done")
      void qc.invalidateQueries({ queryKey: ["route"] })
    } catch (e) {
      if (e instanceof ApiError && (e.code === "CREDIT_LIMIT" || e.code === "CREDIT_HOLD")) {
        setCreditBlocked(e.message)
        setStep("pay")
      } else toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const report = async (p: StopProblem) => {
    await api.post(`/requests/${stop.id}/problem`, { problem: p })
    toast.success("Office alerted")
    setProblem(false)
    void qc.invalidateQueries({ queryKey: ["route"] })
    navigate("/driver")
  }

  const header = (
    <PhoneHeader
      title={party?.name ?? ""}
      subtitle={`Stop ${stop.position} · ${isDelivery ? "delivery" : "supplier pickup"}`}
      left={
        <Button variant="ghost" size="icon" onClick={() => (step === "items" || step === "done" ? navigate("/driver") : setStep(step === "sign" ? "pay" : "items"))} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
      }
      right={
        step !== "done" ? (
          <Button variant="destructive" size="sm" onClick={() => setProblem(true)}>
            <AlertTriangle className="size-4" /> {t("driver.problem")}
          </Button>
        ) : null
      }
    />
  )

  if (step === "done") {
    return (
      <>
        {header}
        <Screen className="flex flex-col items-center justify-center gap-4 text-center">
          <CheckCircle2 className="size-20 text-status-green" />
          <h2 className="text-2xl font-semibold">{isDelivery ? "Delivered" : "Collected"}</h2>
          <p className="text-muted-foreground">
            {formatRs(total)} · {method === "PART" ? `Rs ${received} paid, rest on credit` : method?.toLowerCase()}
            <br />
            {queued ? "Saved on this phone; it will send when you're back online." : isDelivery ? "Receipt sent by SMS / WhatsApp." : "Quantities and price confirmed with signature."}
          </p>
        </Screen>
        <PrimaryActionBar>
          <Button className="h-14 w-full text-lg" onClick={() => navigate("/driver")}>
            Next stop <Check className="size-5" />
          </Button>
        </PrimaryActionBar>
      </>
    )
  }

  return (
    <>
      {header}
      <Screen>
        <Steps step={step} />

        {step === "items" ? (
          <>
            <p className="text-sm text-muted-foreground">{isDelivery ? "Tick what you handed over. Short or damaged? Change the number." : "Confirm what you collected and the price."}</p>
            <ul className="space-y-2">
              {lines.map((l) => (
                <li key={l.id} className={cn("flex items-center gap-2 rounded-xl border p-3", l.quantity !== stop.lines.find((x) => x.id === l.id)?.quantity && "border-status-amber bg-status-amber-soft/40")}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-semibold">{l.item.name}</span>
                    <span className="block text-sm text-muted-foreground tabular">
                      ordered {stop.lines.find((x) => x.id === l.id)?.quantity} · {formatRs(l.rateCents)} / {l.item.unit}
                    </span>
                  </span>
                  <Button variant="outline" className="size-12" onClick={() => setQty({ ...qty, [l.itemId]: Math.max(0, l.quantity - (l.item.packSize > 1 ? l.item.packSize : 1)) })} aria-label="less">
                    <Minus className="size-5" />
                  </Button>
                  <span className="w-16 text-center text-2xl font-bold tabular">{l.quantity}</span>
                  <Button variant="outline" className="size-12" onClick={() => setQty({ ...qty, [l.itemId]: l.quantity + (l.item.packSize > 1 ? l.item.packSize : 1) })} aria-label="more">
                    <Plus className="size-5" />
                  </Button>
                </li>
              ))}
            </ul>
            {!isDelivery ? <p className="text-sm text-muted-foreground">If the supplier quotes a different price, finish here and tell the office; the difference becomes a price change request.</p> : null}
          </>
        ) : null}

        {step === "pay" ? (
          <>
            <div className="rounded-xl bg-muted px-4 py-3 text-center">
              <div className="text-sm text-muted-foreground">{isDelivery ? "Amount due" : "Amount to pay"}</div>
              <div className="text-3xl font-bold tabular">{formatRs(total)}</div>
              {isDelivery && stop.oldBalanceCents ? <div className="text-sm text-muted-foreground">+ {formatRsShort(stop.oldBalanceCents)} old balance</div> : null}
            </div>
            {creditBlocked ? (
              <div className="space-y-2 rounded-xl border border-status-red/40 bg-status-red-soft p-3">
                <p className="text-sm font-medium">{creditBlocked}</p>
                <Button asChild variant="outline" className="h-11 w-full">
                  <a href={telHref("0112345670")}>
                    <Phone className="size-4" /> Call office
                  </a>
                </Button>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["CASH", Banknote, t("pos.cash")],
                  ["CHEQUE", FileText, t("pos.cheque")],
                  ["CREDIT", CreditCard, t("pos.credit")],
                  ["PART", SplitSquareHorizontal, "Part payment"],
                ] as [Method, React.ComponentType<{ className?: string }>, string][]
              ).map(([m, Icon, label]) => (
                <button key={m} type="button" onClick={() => setMethod(m)} className={cn("flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border text-lg font-semibold transition-colors", method === m ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent", m === "CREDIT" && party?.creditHold && "opacity-50")} disabled={m === "CREDIT" && party?.creditHold}>
                  <Icon className="size-6" />
                  {label}
                </button>
              ))}
            </div>
            {method === "CASH" || method === "PART" ? (
              <div className="space-y-1.5">
                <Label className="text-base">{method === "PART" ? "Received now (rest goes to credit)" : "Amount received"}</Label>
                <Input type="number" inputMode="decimal" className="h-14 text-right text-2xl font-bold tabular" value={received || (method === "CASH" ? String(total / 100) : "")} onChange={(e) => setReceived(e.target.value)} />
                {method === "CASH" && receivedCents > total ? <p className="text-sm text-muted-foreground">Change {formatRs(receivedCents - total)}</p> : null}
              </div>
            ) : null}
            {method === "CHEQUE" ? (
              <div className="grid gap-2">
                <Input className="h-12 text-base" placeholder="Cheque number" inputMode="numeric" value={cheque.number} onChange={(e) => setCheque({ ...cheque, number: e.target.value })} />
                <Input className="h-12 text-base" placeholder="Bank" value={cheque.bank} onChange={(e) => setCheque({ ...cheque, bank: e.target.value })} />
                <Input className="h-12 text-base" type="date" value={cheque.date} onChange={(e) => setCheque({ ...cheque, date: e.target.value })} />
                <p className="text-sm text-muted-foreground">Take a photo of the cheque with your camera app; attach from the office later.</p>
              </div>
            ) : null}
            {method === "CREDIT" && party ? <ToneBadge tone={(party.balanceCents ?? 0) + total > party.creditLimitCents ? "red" : "green"}>Remaining limit after this: {formatRsShort(party.creditLimitCents - (party.balanceCents ?? 0) - total)}</ToneBadge> : null}
          </>
        ) : null}

        {step === "sign" ? (
          <>
            <div className="rounded-xl bg-muted px-4 py-2 text-center text-sm">
              <span className="font-medium">{lines.map((l) => `${l.quantity} ${l.item.name}`).join(", ")}</span> · {formatRs(total)} · {method === "PART" ? "part payment" : method?.toLowerCase()}
            </div>
            <SignaturePad value={signature} onChange={setSignature} label={isDelivery ? t("driver.sign") : "Supplier signs here"} />
            <div className="space-y-1.5">
              <Label className="text-base">Name of the person signing</Label>
              <Input className="h-12 text-base" placeholder={party?.name} value={signer} onChange={(e) => setSigner(e.target.value)} list="signers" />
              <datalist id="signers">
                <option value={party?.name ?? ""} />
                <option value="Manager" />
                <option value="Cashier" />
                <option value="Kitchen" />
              </datalist>
            </div>
          </>
        ) : null}
      </Screen>

      <PrimaryActionBar>
        {step === "items" ? (
          <Button
            className="h-14 w-full text-lg"
            onClick={() => {
              void arrive()
              setStep("pay")
            }}
          >
            Confirm items <Check className="size-5" />
          </Button>
        ) : step === "pay" ? (
          <Button className="h-14 w-full text-lg" disabled={!method || (method === "CHEQUE" && (!cheque.number || !cheque.bank)) || (method === "PART" && !received)} onClick={() => setStep("sign")}>
            {method === "CASH" || method === "PART" ? t("driver.collect", { amount: formatRs(method === "PART" ? receivedCents : total) }) : method === "CHEQUE" ? `Cheque for ${formatRs(total)}` : method === "CREDIT" ? `Credit ${formatRs(total)}` : "Choose payment"}
          </Button>
        ) : (
          <Button className="h-14 w-full text-lg" disabled={!signature || !signer || busy} onClick={() => void submit()}>
            {t("common.confirm")} <Check className="size-5" />
          </Button>
        )}
      </PrimaryActionBar>

      <Dialog open={problem} onOpenChange={setProblem}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What's the problem?</DialogTitle>
            <DialogDescription>The office is alerted at once. A breakdown lets them move your remaining stops.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {(
              [
                ["NOT_THERE", "Customer not there"],
                ["REFUSED", "Refused goods"],
                ["CANT_REACH", "Can't reach"],
                ["BREAKDOWN", "Vehicle breakdown"],
              ] as [StopProblem, string][]
            ).map(([p, label]) => (
              <Button key={p} variant={p === "BREAKDOWN" ? "destructive" : "outline"} className="h-14 text-base" onClick={() => void report(p)}>
                {label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Steps({ step }: { step: Step }) {
  const steps: Step[] = ["items", "pay", "sign"]
  const labels = { items: "Items", pay: "Payment", sign: "Signature", done: "" }
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const idx = steps.indexOf(step)
        const state = i < idx ? "done" : i === idx ? "now" : "todo"
        return (
          <li key={s} className="flex flex-1 items-center gap-1.5">
            <span className={cn("flex size-6 items-center justify-center rounded-full text-[11px] font-bold", state === "done" && "bg-status-green text-white", state === "now" && "bg-primary text-primary-foreground", state === "todo" && "bg-muted text-muted-foreground")}>{state === "done" ? <Check className="size-3.5" /> : i + 1}</span>
            <span className={cn(state === "todo" && "text-muted-foreground")}>{labels[s]}</span>
            {i < steps.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
          </li>
        )
      })}
    </ol>
  )
}

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { Wifi, WifiOff, HelpCircle, LogOut, Languages, Phone, MessageCircle, Inbox, CircleAlert } from "lucide-react"
import type { RequestStatus, RequestType, StopStatus } from "shared"
import { cn, formatRs, telHref, waHref, initials } from "@/lib/utils"
import { useOffline } from "@/lib/offline"
import { useAuth } from "@/lib/auth"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

/** Online / Offline – 3 waiting / Synced 08:42 (spec §7). */
export function SyncChip({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { online, pending, lastSyncAt } = useOffline()
  const label = !online
    ? pending > 0
      ? t("common.waiting", { count: pending })
      : t("common.offline")
    : pending > 0
      ? t("common.waiting", { count: pending })
      : lastSyncAt
        ? t("common.synced", { time: lastSyncAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })
        : t("common.online")
  const tone = !online ? "red" : pending > 0 ? "amber" : "green"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular",
        tone === "green" && "border-status-green/30 bg-status-green-soft text-status-green",
        tone === "amber" && "border-status-amber/30 bg-status-amber-soft text-amber-800 dark:text-status-amber",
        tone === "red" && "border-status-red/30 bg-status-red-soft text-status-red",
        className
      )}
      aria-live="polite"
    >
      {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
      {label}
    </span>
  )
}

type Tone = "green" | "amber" | "red" | "blue" | "grey"
export const toneClass: Record<Tone, string> = {
  green: "border-transparent bg-status-green-soft text-green-800 dark:text-status-green",
  amber: "border-transparent bg-status-amber-soft text-amber-800 dark:text-status-amber",
  red: "border-transparent bg-status-red-soft text-red-800 dark:text-status-red",
  blue: "border-transparent bg-status-blue-soft text-blue-800 dark:text-status-blue",
  grey: "border-transparent bg-status-grey-soft text-muted-foreground",
}

export const statusTone: Record<RequestStatus | StopStatus | "NEXT", Tone> = {
  PROPOSED: "blue",
  APPROVED: "grey",
  IN_PROGRESS: "amber",
  DONE: "green",
  REJECTED: "red",
  PENDING: "grey",
  SKIPPED: "grey",
  PROBLEM: "red",
  NEXT: "amber",
}

/** Colour always paired with a word (spec §7). */
export function StatusBadge({ status, className }: { status: RequestStatus | StopStatus | "NEXT"; className?: string }) {
  const { t } = useTranslation()
  return (
    <Badge variant="outline" className={cn(toneClass[statusTone[status]], className)}>
      {t(`status.${status}`)}
    </Badge>
  )
}

export function TypeBadge({ type, className }: { type: RequestType; className?: string }) {
  const { t } = useTranslation()
  return (
    <Badge variant="secondary" className={cn("font-medium", className)}>
      {t(`types.${type}`)}
    </Badge>
  )
}

export function ToneBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn(toneClass[tone], className)}>
      {children}
    </Badge>
  )
}

export function Money({ cents, className, bold = true }: { cents: number; className?: string; bold?: boolean }) {
  return <span className={cn("tabular", bold && "font-semibold", className)}>{formatRs(cents)}</span>
}

export function EmptyState({ icon: Icon = Inbox, title, hint, action }: { icon?: React.ComponentType<{ className?: string }>; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      <Icon className="size-8 text-muted-foreground/60" />
      <p className="font-medium">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-muted-foreground">{hint}</p> : null}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation()
  const msg = error instanceof Error ? error.message : t("common.error")
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-status-red/30 bg-status-red-soft/60 px-6 py-8 text-center">
      <CircleAlert className="size-6 text-status-red" />
      <p className="text-sm">{msg}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      ) : null}
    </div>
  )
}

export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  )
}

/** ? on every screen opens a short picture guide (spec §7). */
export function HelpButton({ title, steps }: { title: string; steps: string[] }) {
  const { t } = useTranslation()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("common.help")}>
          <HelpCircle className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("common.help")}</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
              <span className="pt-0.5 text-sm leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  )
}

/** Avatar menu: language switch and sign out. */
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation()
  const { user, logout, setLanguage } = useAuth()
  if (!user) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={cn("gap-2 px-2", compact && "size-10 rounded-full p-0")} aria-label={user.displayName}>
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/20 text-xs font-semibold">{initials(user.displayName)}</AvatarFallback>
          </Avatar>
          {!compact ? <span className="hidden text-sm font-medium md:inline">{user.displayName}</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-medium">{user.displayName}</div>
          <div className="text-xs font-normal text-muted-foreground">{t(`roles.${user.role}`)}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void setLanguage(i18n.language === "en" ? "si" : "en")}>
          <Languages className="size-4" />
          {i18n.language === "en" ? "සිංහල" : "English"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/">{t("home.switch")}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} variant="destructive">
          <LogOut className="size-4" />
          {t("common.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ContactButtons({ phone, whatsapp, text, size = "sm" }: { phone?: string | null; whatsapp?: string | null; text?: string; size?: "sm" | "default" | "lg" }) {
  const { t } = useTranslation()
  return (
    <div className="flex gap-2">
      {phone ? (
        <Button asChild size={size} variant="default">
          <a href={telHref(phone)}>
            <Phone className="size-4" />
            {t("common.call")}
          </a>
        </Button>
      ) : null}
      {whatsapp || phone ? (
        <Button asChild size={size} variant="outline">
          <a href={waHref(whatsapp ?? phone, text)} target="_blank" rel="noreferrer">
            <MessageCircle className="size-4" />
            {t("common.whatsapp")}
          </a>
        </Button>
      ) : null}
    </div>
  )
}

export function HealthDot({ colour, className }: { colour: "green" | "amber" | "red"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-2.5 rounded-full",
        colour === "green" && "bg-status-green",
        colour === "amber" && "bg-status-amber",
        colour === "red" && "bg-status-red",
        className
      )}
      aria-label={colour}
    />
  )
}

export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
      {action}
    </div>
  )
}

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * A phone-sized app. On a real phone it fills the screen; on a desktop it is a centred
 * 430px block so the layout is always designed for one thumb (spec §8, §11, §12).
 */
export function MobileFrame({ children, className, width = 430 }: { children: React.ReactNode; className?: string; width?: 430 | 520 }) {
  return (
    <div className="phone min-h-svh bg-muted/40 sm:flex sm:items-stretch sm:justify-center sm:py-6">
      <div
        className={cn(
          "relative flex min-h-svh w-full flex-col bg-background sm:min-h-[calc(100svh-3rem)] sm:rounded-[2rem] sm:border sm:shadow-xl sm:ring-8 sm:ring-foreground/5",
          className
        )}
        style={{ maxWidth: width }}
      >
        {children}
      </div>
    </div>
  )
}

/** Bottom tab bar for phone apps. Children are NavLink-style buttons. */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <nav className="safe-bottom sticky bottom-0 z-20 mt-auto grid auto-cols-fr grid-flow-col gap-1 border-t bg-background/95 px-2 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:rounded-b-[2rem]">
      {children}
    </nav>
  )
}

/** Sticky header for phone screens. */
export function PhoneHeader({
  title,
  subtitle,
  left,
  right,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  left?: React.ReactNode
  right?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("sticky top-0 z-20 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:rounded-t-[2rem]", className)}>
      {left}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
        {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {right}
    </header>
  )
}

/** The one main action per screen, pinned to the bottom (spec §7). */
export function PrimaryActionBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("safe-bottom sticky bottom-0 z-20 mt-auto border-t bg-background/95 px-4 pt-3 backdrop-blur sm:rounded-b-[2rem]", className)}>
      {children}
    </div>
  )
}

export function Screen({ children, className }: { children: React.ReactNode; className?: string }) {
  return <main className={cn("flex-1 space-y-4 px-4 py-4", className)}>{children}</main>
}

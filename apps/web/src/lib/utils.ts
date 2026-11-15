import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export { formatRs, formatRsShort, formatDay, formatTime, toCents, fromCents } from "shared"

export const telHref = (phone?: string | null) => (phone ? `tel:${phone.replace(/\s+/g, "")}` : undefined)

/** WhatsApp click-to-chat link, prefilled (spec §6: no paid API in phase 1). */
export const waHref = (phone?: string | null, text?: string) => {
  if (!phone) return undefined
  const digits = phone.replace(/\D/g, "").replace(/^0/, "94")
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")

export const uuid = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
      })

export const todayIso = () => new Date().toISOString().slice(0, 10)

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

/** "3 trays + 10 eggs" for pack-sized items. */
export const packs = (qty: number, packSize: number, unit: string, packName?: string | null) => {
  if (!packName || packSize <= 1) return plural(qty, unit)
  const p = Math.floor(qty / packSize)
  const r = qty % packSize
  if (p === 0) return plural(qty, unit)
  return r === 0 ? plural(p, packName) : `${plural(p, packName)} + ${plural(r, unit)}`
}

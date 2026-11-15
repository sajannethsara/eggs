import * as React from "react"
import { Eraser } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Full-width white pad, finger or mouse. Emits a PNG data URL (spec §11.3). */
export function SignaturePad({ value, onChange, label, className }: { value: string | null; onChange: (dataUrl: string | null) => void; label: string; className?: string }) {
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const drawing = React.useRef(false)
  const last = React.useRef<{ x: number; y: number } | null>(null)

  React.useEffect(() => {
    const c = canvas.current
    if (!c) return
    const ratio = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = rect.width * ratio
    c.height = rect.height * ratio
    const ctx = c.getContext("2d")!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#111"
  }, [])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pos(e)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return
    const ctx = e.currentTarget.getContext("2d")!
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }
  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    onChange(e.currentTarget.toDataURL("image/png"))
  }
  const clear = () => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext("2d")!
    ctx.clearRect(0, 0, c.width, c.height)
    onChange(null)
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <canvas ref={canvas} className="h-56 w-full touch-none rounded-xl border-2 border-dashed bg-white" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerLeave={end} aria-label={label} />
        {!value ? <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground">{label}</span> : null}
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={clear} disabled={!value}>
          <Eraser className="size-4" /> Clear
        </Button>
      </div>
    </div>
  )
}

import { Link } from "react-router"
import { Button } from "@/components/ui/button"

export function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">That page doesn't exist</h1>
      <Button asChild>
        <Link to="/">Go to the start</Link>
      </Button>
    </div>
  )
}

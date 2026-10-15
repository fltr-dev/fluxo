import { Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

/** Marca: quadrado na cor de destaque com a carteira (mesmo desenho do favicon). */
export function Logo({ small, className }: { small?: boolean; className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground", small ? "size-7" : "size-8", className)}>
      <Wallet className={small ? "size-4" : "size-[18px]"} />
    </span>
  )
}

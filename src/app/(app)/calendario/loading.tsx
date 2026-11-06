import { SkChips, SkLine, SkPage, SkTitle } from "@/components/skeletons"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

// 5 semanas: o mês típico
const CELLS = 35

export default function Loading() {
  return (
    <SkPage>
      <SkTitle title="w-40" description="w-[30rem]" wrap>
        <div className="flex items-center gap-1">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex min-w-36 justify-center"><SkLine className="w-28" /></div>
          <Skeleton className="size-8 rounded-lg" />
        </div>
      </SkTitle>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-52 rounded-lg" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SkChips items={["w-36", "w-36"]} />
      </div>

      <section className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="gap-0.5 px-4 py-3">
            <SkLine className="h-4 w-20 sm:h-5 sm:w-28" />
            <SkLine className="h-6 w-24 sm:h-7 sm:w-32" />
          </Card>
        ))}
      </section>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex justify-center py-2">
              <SkLine className="h-4 w-6 sm:w-14" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border">
          {Array.from({ length: CELLS }, (_, i) => (
            <div key={i} className="flex min-h-[4.5rem] flex-col gap-0.5 bg-card p-1 sm:min-h-24 sm:p-2">
              <Skeleton className="size-6 rounded-full opacity-60" />
            </div>
          ))}
        </div>
      </Card>
      <SkLine className="h-4 w-80" />
    </SkPage>
  )
}

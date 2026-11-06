import { SkCardHeader, SkLine, SkPage, SkStat, SkTitle } from "@/components/skeletons"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const NAMES = ["w-28", "w-36", "w-24", "w-32", "w-28", "w-24"]

export default function Loading() {
  return (
    <SkPage className="grid gap-5">
      <SkTitle title="w-56" description="w-[26rem]" wrap actions={["w-32"]} />

      <Card className="gap-0 py-0">
        <div className="grid sm:grid-cols-4">
          {Array.from({ length: 3 }, (_, i) => (
            <SkStat key={i} className={i > 0 ? "border-t sm:border-t-0 sm:border-l" : undefined} />
          ))}
          <div className="grid content-start gap-2 border-t px-5 py-4 sm:border-t-0 sm:border-l">
            <SkLine className="w-20" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </div>
        </div>
        <div className="px-5 pb-5">
          <Skeleton className="h-2.5 rounded-full" />
        </div>
      </Card>

      <Card className="gap-0 pb-0">
        <SkCardHeader title="w-32" right="h-4 w-80 max-sm:hidden" className="flex-wrap gap-2 pb-3" />
        {/* Celular: lista */}
        <div className="border-t md:hidden">
          {NAMES.map((w, i) => (
            <div key={i} className="grid gap-2 border-b px-4 py-3 last:border-0">
              <span className="flex items-center gap-2.5">
                <Skeleton className="size-2.5 shrink-0 rounded-full" />
                <span className="min-w-0 flex-1"><SkLine className={w} /></span>
                <Skeleton className="h-5 w-12 rounded-full" />
              </span>
              <Skeleton className="h-2 rounded-full" />
              <span className="flex justify-between gap-2">
                <SkLine className="h-4 w-36" />
                <SkLine className="h-4 w-24" />
              </span>
            </div>
          ))}
        </div>
        {/* Desktop: tabela */}
        <div className="border-t max-md:hidden">
          <div className="flex h-10 items-center border-b px-5">
            <SkLine className="w-20" />
          </div>
          {NAMES.map((w, i) => (
            <div key={i} className="flex h-[57px] items-center gap-3 border-b px-5 last:border-0">
              <Skeleton className="size-2.5 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1"><SkLine className={w} /></div>
              <Skeleton className="h-2 w-40 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
              <SkLine className="ml-6 w-64" />
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="size-7 rounded-md" />
            </div>
          ))}
        </div>
      </Card>
    </SkPage>
  )
}

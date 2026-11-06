import { SkChips, SkInvestHeader, SkLine, SkPage, SkRow } from "@/components/skeletons"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <SkPage>
      <SkInvestHeader active={1}>
        <Skeleton className="h-7 w-32 rounded-lg" />
      </SkInvestHeader>

      <Card className="gap-3 px-5 py-4">
        <div className="flex flex-wrap justify-between gap-2">
          <SkLine className="w-44" />
          <SkLine className="h-4 w-72" />
        </div>
        <Skeleton className="h-3 rounded-full" />
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {["w-24", "w-28", "w-20", "w-24"].map((w, i) => (
            <SkLine key={i} className={`h-4 ${w}`} />
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 min-w-52 flex-1 rounded-lg sm:max-w-72" />
        <SkChips items={["w-20", "w-32", "w-28", "w-24"]} />
      </div>

      <Card className="gap-0 py-0">
        <div className="flex min-h-13 items-center gap-2.5 px-5 py-2">
          <Skeleton className="size-3 rounded-[3px]" />
          <SkLine className="w-32" />
          <SkLine className="ml-auto w-24" />
        </div>
        <div className="flex h-9 items-center border-y bg-muted/40 px-5">
          <SkLine className="h-4 w-12" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <SkRow
            key={i}
            className="min-h-15 border-t border-border/60 px-5 py-2"
            icon="size-9 rounded-[10px]"
            title={["w-16", "w-20", "w-14", "w-16", "w-20", "w-14"][i]}
            sub="w-40"
            right="w-24"
          />
        ))}
      </Card>
    </SkPage>
  )
}

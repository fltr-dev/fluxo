import { SkCardHead, SkChart, SkInvestHeader, SkInvestKpis, SkLine, SkPage, SkTabs } from "@/components/skeletons"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <SkPage>
      <SkInvestHeader active={2} />

      <SkInvestKpis n={4} className="lg:grid-cols-4" />

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="gap-4 px-5 py-5">
          <SkCardHead title="w-44" description="w-64" />
          <SkChart className="h-[240px]" legend />
        </Card>
        <Card className="gap-3 px-5 py-5">
          <SkCardHead title="w-24" description="w-48" />
          <div className="grid content-start">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex min-h-11 items-center gap-3 border-t py-1.5 first:border-0">
                <Skeleton className="size-[30px] shrink-0 rounded-[10px]" />
                <SkLine className="w-20 shrink-0" />
                <Skeleton className="h-2 min-w-12 flex-1 rounded-full" />
                <SkLine className="w-24 shrink-0" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
          <SkCardHead title="w-28" description="w-64" />
          <SkTabs items={["w-14", "w-10", "w-20", "w-11", "w-14"]} item="h-7" />
        </div>
        <div className="flex h-9 items-center border-y bg-muted/40 px-5">
          <SkLine className="h-4 w-20" />
        </div>
        <div className="flex h-8 items-center border-t px-5">
          <SkLine className="h-4 w-20" />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex min-h-14 items-center gap-3 border-t border-border/60 px-5 py-2">
            <div className="grid w-[92px] shrink-0">
              <SkLine className="w-14" />
              <SkLine className="h-4 w-10" />
            </div>
            <Skeleton className="size-8 shrink-0 rounded-[10px]" />
            <div className="grid min-w-0 flex-1">
              <SkLine className="w-16" />
              <SkLine className="h-4 w-32" />
            </div>
            <SkLine className="w-20" />
          </div>
        ))}
      </Card>
    </SkPage>
  )
}

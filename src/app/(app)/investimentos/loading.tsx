import { SkCardHead, SkChart, SkInvestHeader, SkInvestKpis, SkLine, SkPage, SkRow, SkTabs } from "@/components/skeletons"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

// Resumo da carteira
export default function Loading() {
  return (
    <SkPage>
      <SkInvestHeader active={0}>
        <SkTabs items={["w-9", "w-11", "w-16", "w-12"]} item="h-7" />
      </SkInvestHeader>

      <SkInvestKpis n={5} className="sm:grid-cols-3 xl:grid-cols-5" />

      <Card className="gap-4 px-5 py-5">
        <SkCardHead title="w-44" description="w-80" />
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {["w-24", "w-16", "w-16", "w-16"].map((w, i) => (
                <Skeleton key={i} className={`h-8 rounded-full ${w}`} />
              ))}
            </div>
            <SkTabs items={["w-24", "w-24"]} item="h-7" />
          </div>
          <SkChart className="h-[260px]" />
        </div>
      </Card>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Card className="gap-4 px-5 py-5">
          <SkCardHead title="w-48" description="w-56" />
          <div className="flex flex-1 flex-wrap items-center gap-5">
            <Skeleton className="size-[168px] shrink-0 rounded-full opacity-60" />
            <div className="grid min-w-44 flex-1">
              {Array.from({ length: 4 }, (_, i) => (
                <SkRow key={i} className="min-h-9 border-t py-1 first:border-0" icon="size-2.5 rounded-[3px]" title="w-24" sub={false} right="w-24" />
              ))}
            </div>
          </div>
        </Card>
        <Card className="gap-4 px-5 py-5">
          <SkCardHead title="w-32" description="w-72" action="w-24" />
          <div className="grid">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-t py-2">
                <SkLine className="w-28" />
                <Skeleton className="h-2 flex-1 rounded-full" />
                <SkLine className="w-24" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="gap-4 px-5 py-5">
          <SkCardHead title="w-52" description="w-56" />
          <SkChart legend />
        </Card>
        <Card className="gap-4 px-5 py-5">
          <SkCardHead title="w-24" description="w-60" action="w-20" />
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="grid bg-card px-3.5 py-2.5">
                <SkLine className="h-4 w-24" />
                <SkLine className="h-7 w-28" />
                <SkLine className="h-4 w-32" />
              </div>
            ))}
          </div>
          <div className="grid">
            <SkLine className="h-6 w-36 pb-1" />
            {Array.from({ length: 3 }, (_, i) => (
              <SkRow key={i} className="min-h-12 border-t py-1.5" icon="size-8 rounded-[10px]" title="w-16" sub="w-20" right="w-20" />
            ))}
          </div>
        </Card>
      </div>
    </SkPage>
  )
}

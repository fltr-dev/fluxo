import { SkButton, SkCardHead, SkChart, SkLine, SkPage, SkTabs } from "@/components/skeletons"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <SkPage>
      <Skeleton className="-ml-2 h-7 w-20 justify-self-start rounded-lg" />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Skeleton className="size-[52px] shrink-0 rounded-[10px]" />
          <div className="grid min-w-0 gap-1">
            <SkLine className="h-8 w-56" />
            <div className="flex gap-1.5">
              {["w-20", "w-16", "w-14"].map((w, i) => (
                <Skeleton key={i} className={`h-5 rounded-md ${w}`} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid justify-items-end">
            <SkLine className="h-9 w-36" />
            <SkLine className="h-4 w-40" />
          </div>
          <SkButton className="w-20" />
          <SkButton className="w-36" />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={i === 0 ? "grid content-start gap-1 bg-card px-4 py-3.5 max-sm:col-span-2" : "grid content-start gap-1 bg-card px-4 py-3.5"}>
            <SkLine className="h-4 w-20" />
            <SkLine className="h-7 w-28" />
            <SkLine className="h-4 w-24" />
          </div>
        ))}
      </section>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <Card className="gap-4 px-5 py-5">
          <SkCardHead title="w-24" description="w-80" />
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {["w-20", "w-16", "w-16", "w-16"].map((w, i) => (
                  <Skeleton key={i} className={`h-8 rounded-full ${w}`} />
                ))}
              </div>
              <SkTabs items={["w-24", "w-24"]} item="h-7" />
            </div>
            <SkChart className="h-[240px]" />
          </div>
        </Card>
        <Card className="gap-4 px-5 py-5">
          <SkCardHead title="w-24" description="w-56" />
          <div className="grid gap-1.5">
            <Skeleton className="h-3 rounded-full" />
            <SkLine className="h-4 w-44" />
          </div>
          <div className="grid">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border-t py-2.5 first:border-0">
                <SkLine className="w-32" />
                <SkLine className="w-24" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <Card className="gap-0 py-0">
          <div className="px-5 pt-5 pb-3">
            <SkCardHead title="w-36" description="w-64" />
          </div>
          <div className="flex h-9 items-center border-y bg-muted/40 px-5">
            <SkLine className="h-4 w-12" />
          </div>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex min-h-12 items-center gap-3 border-t border-border/60 px-5 py-2">
              <SkLine className="w-20" />
              <Skeleton className="h-5 w-16 rounded-md" />
              <SkLine className="ml-auto w-24" />
            </div>
          ))}
        </Card>
        <Card className="gap-3 px-5 py-5">
          <SkCardHead title="w-24" description="w-32" action="w-16" />
          <div className="grid">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex min-h-11 items-center gap-2.5 border-t py-1.5 first:border-0">
                <SkLine className="w-20" />
                <Skeleton className="h-5 w-20 rounded-md" />
                <SkLine className="ml-auto w-20" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </SkPage>
  )
}

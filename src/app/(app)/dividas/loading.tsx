import { SkLine, SkPage, SkStat, SkTabs, SkTitle } from "@/components/skeletons"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export default function Loading() {
  return (
    <SkPage className="grid gap-5">
      <SkTitle title="w-28" description="w-[34rem]" wrap actions={["w-32", "w-32"]} />

      <Card className="grid gap-0 py-0 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <SkStat key={i} className={cn(i > 0 && "border-t sm:border-l lg:border-t-0", i === 2 && "sm:border-t sm:border-l-0 lg:border-t-0 lg:border-l", i === 1 && "sm:border-t-0")} />
        ))}
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="grid gap-3">
          <SkTabs items={["w-24", "w-[5.5rem]", "w-16"]} className="w-fit" />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="grid gap-3 rounded-2xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="size-10 shrink-0 rounded-[11px]" />
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <SkLine className="h-6 w-36" />
                  <SkLine className="w-56" />
                </div>
                <div className="grid justify-items-end">
                  <SkLine className="h-6 w-24" />
                  <SkLine className="h-4 w-16" />
                </div>
              </div>
              <Skeleton className="h-1.5 rounded-full" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <SkLine className="w-28" />
                <SkLine className="w-52" />
                <Skeleton className="ml-auto h-7 w-44 rounded-lg" />
              </div>
            </div>
          ))}
        </section>

        <aside className="grid gap-4">
          <Card className="gap-0 py-0">
            <div className="flex items-center gap-2.5 border-b px-4 py-3">
              <Skeleton className="size-8 rounded-lg" />
              <div className="grid">
                <SkLine className="w-32" />
                <SkLine className="h-4 w-24" />
              </div>
            </div>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-0">
                <div className="grid w-11 shrink-0 justify-items-center">
                  <SkLine className="h-6 w-6" />
                  <SkLine className="h-4 w-7" />
                </div>
                <div className="grid min-w-0 flex-1">
                  <SkLine className="w-28" />
                  <SkLine className="h-4 w-16" />
                </div>
                <SkLine className="w-20" />
              </div>
            ))}
          </Card>
          <Card className="p-4">
            <div className="grid gap-1">
              <SkLine className="w-12" />
              <SkLine className="w-full" />
              <SkLine className="w-40" />
            </div>
          </Card>
        </aside>
      </div>
    </SkPage>
  )
}

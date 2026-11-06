import { SkLine, SkPage, SkRow, SkTabs, SkTitle } from "@/components/skeletons"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <SkPage className="grid gap-5">
      <SkTitle title="w-40" description="w-[30rem]" wrap actions={["w-24", "w-40"]} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card className="gap-3">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <SkTabs items={["w-28", "w-28", "w-32"]} />
            <SkLine className="hidden h-4 w-32 sm:flex" />
          </CardHeader>
          <CardContent className="grid">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-b py-3 last:border-0">
                <Skeleton className="size-4 shrink-0 rounded-sm opacity-60" />
                <SkRow className="min-w-0 flex-1" icon="size-9 rounded-full" title={["w-28", "w-36", "w-24", "w-32"][i % 4]} sub="w-28" right="w-20" />
                <Skeleton className="size-7 shrink-0 rounded-md" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SkLine className="h-[22px] w-44" />
            <SkLine className="w-full" />
            <SkLine className="w-56" />
          </CardHeader>
          <CardContent className="grid">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="grid gap-1 border-b py-2.5 last:border-0">
                <SkLine className="h-4 w-32" />
                <div className="flex items-center gap-2">
                  <Skeleton className="size-3.5 shrink-0 rounded-sm opacity-60" />
                  <Skeleton className="h-7 flex-1 rounded-lg" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </SkPage>
  )
}

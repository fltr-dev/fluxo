import { SkButton, SkCardHeader, SkLine, SkPage, SkRow, SkTabs, SkTitle } from "@/components/skeletons"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <SkPage className="grid gap-5">
      <SkTitle title="w-28" description="w-[30rem]" wrap actions={["w-32", "w-40"]} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="gap-3 px-4 py-4">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <SkLine className="w-20" />
            </div>
            <div className="grid gap-0.5">
              <SkLine className="h-7 w-32" />
              <SkLine className="h-4 w-36" />
            </div>
          </Card>
        ))}
      </section>

      <Card className="flex-row flex-wrap items-center gap-4 px-5 py-4">
        <Skeleton className="size-10 rounded-xl" />
        <div className="grid min-w-56 flex-1">
          <SkLine className="w-80" />
          <SkLine className="w-96" />
        </div>
        <SkButton className="w-32" />
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SkLine className="w-24" />
            <SkTabs items={["w-14", "w-14", "w-14"]} />
          </div>
          {[3, 2].map((n, g) => (
            <Card key={g} className="gap-2">
              <SkCardHeader title="w-32" right="w-24" />
              <CardContent className="grid grid-cols-1 px-2 sm:px-4">
                {Array.from({ length: n }, (_, i) => (
                  <SkRow key={i} className="min-h-14 px-2 py-1.5" icon="size-9 rounded-[10px]" title="w-36" sub="w-44" right="w-24" />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid min-w-0 gap-4">
          <Card>
            <SkCardHeader title="w-24" />
            <CardContent className="grid grid-cols-1">
              {Array.from({ length: 2 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 border-b py-3 first:pt-0 last:border-0 last:pb-0">
                  <Skeleton className="size-9 shrink-0 rounded-[10px]" />
                  <div className="grid min-w-0 flex-1">
                    <SkLine className="w-32" />
                    <SkLine className="h-4 w-44" />
                    <SkLine className="h-4 w-28" />
                  </div>
                  <Skeleton className="size-8 rounded-lg" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <SkCardHeader title="w-48" />
            <CardContent className="grid grid-cols-1">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 border-b py-2.5 last:border-0">
                  <Skeleton className="size-2 shrink-0 rounded-full" />
                  <div className="flex-1"><SkLine className="w-40" /></div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </SkPage>
  )
}

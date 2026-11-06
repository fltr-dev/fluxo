import { SkLine, SkPage, SkStats, SkTitle } from "@/components/skeletons"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <SkPage className="grid gap-5">
      <SkTitle title="w-24" description="w-[28rem]" wrap actions={["w-28"]} />

      <SkStats n={3} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className={i === 2 ? "h-full max-xl:hidden" : "h-full"}>
            <CardHeader className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="grid min-w-0">
                  <SkLine className="w-32" />
                  <SkLine className="h-4 w-40" />
                </div>
              </div>
              <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <SkLine className="h-7 w-28" />
                  <SkLine className="w-24" />
                </div>
                <Skeleton className="h-2.5 rounded-full" />
                <SkLine className="h-4 w-24" />
              </div>
              <div className="grid grid-cols-3 rounded-xl border">
                {Array.from({ length: 3 }, (_, j) => (
                  <div key={j} className={j > 0 ? "grid min-w-0 gap-0.5 border-l px-3 py-2.5" : "grid min-w-0 gap-0.5 px-3 py-2.5"}>
                    <SkLine className="h-4 w-14" />
                    <SkLine className="w-16" />
                  </div>
                ))}
              </div>
            </CardContent>
            <div className="mt-auto flex items-center gap-2 border-t px-4 pt-3">
              <Skeleton className="h-8 w-28 rounded-lg" />
              <Skeleton className="ml-auto h-8 w-20 rounded-lg" />
            </div>
          </Card>
        ))}
      </div>
    </SkPage>
  )
}

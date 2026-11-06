import { SkCardHeader, SkChart, SkLine, SkPage, SkTitle, SkTxDays } from "@/components/skeletons"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export default function Loading() {
  return (
    <SkPage className="grid gap-5">
      <SkTitle title="w-48" description="w-28" actions={["w-36", "w-20"]} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,4fr)_repeat(3,minmax(0,3fr))] lg:gap-4">
        <Card className="col-span-2 flex-row flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 lg:col-span-1">
          <Skeleton className="size-12 rounded-xl" />
          <div className="grid">
            <SkLine className="w-24" />
            <SkLine className="h-8 w-36" />
          </div>
        </Card>
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className={cn("gap-1 px-4 py-4", i === 2 && "col-span-2 lg:col-span-1")}>
            <SkLine className="w-32" />
            <SkLine className="h-7 w-28" />
            <SkLine className="h-4 w-28" />
          </Card>
        ))}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card>
          <SkCardHeader title="w-36" />
          <CardContent>
            <SkChart />
          </CardContent>
        </Card>
        <Card>
          <SkCardHeader title="w-20" />
          <CardContent>
            <div className="grid gap-2.5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex justify-between gap-4 border-b pb-2.5 last:border-0 last:pb-0">
                  <SkLine className="w-24" />
                  <SkLine className="w-28" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SkLine className="h-7 w-52" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-56 rounded-lg" />
            <Skeleton className="h-8 w-36 rounded-lg" />
          </div>
        </div>
        <SkTxDays days={[3, 3]} />
      </section>
    </SkPage>
  )
}

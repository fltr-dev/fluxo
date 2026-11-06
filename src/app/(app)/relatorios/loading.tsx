import { SkCardHeader, SkChart, SkLine, SkPage, SkStat, SkTabs, SkTitle } from "@/components/skeletons"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

// Aba padrão (Comparativos)
export default function Loading() {
  return (
    <SkPage className="grid gap-5">
      <SkTitle title="w-40" description="w-[26rem]" wrap actions={["w-32"]} />
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-36 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <SkTabs items={["w-36", "w-28", "w-32", "w-32"]} />

      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SkLine className="w-28" />
          <SkTabs items={["w-36", "w-36", "w-28"]} />
        </div>

        <Card className="grid gap-0 py-0 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <SkStat key={i} className={i > 0 ? "gap-1 border-t sm:border-t-0 sm:border-l" : "gap-1"} />
          ))}
        </Card>

        <Card>
          <SkCardHeader title="w-48" right="h-4 w-64" />
          <CardContent>
            <SkChart className="h-[260px]" legend />
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <div className="flex h-10 items-center justify-between border-b px-5">
            <SkLine className="w-20" />
            <SkLine className="w-56" />
          </div>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex h-12 items-center justify-between gap-3 border-b px-5 last:border-0">
              <SkLine className={["w-32", "w-24", "w-28", "w-36", "w-24"][i]} />
              <SkLine className="w-60" />
            </div>
          ))}
        </Card>
      </div>
    </SkPage>
  )
}

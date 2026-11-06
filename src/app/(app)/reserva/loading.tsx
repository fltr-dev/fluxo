import { SkChart, SkLine, SkPage, SkStat, SkTitle } from "@/components/skeletons"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const CardHead = ({ title }: { title: string }) => (
  <CardHeader>
    <SkLine className={`h-[22px] ${title}`} />
    <SkLine className="w-64" />
  </CardHeader>
)

export default function Loading() {
  return (
    <SkPage className="grid gap-5">
      <SkTitle title="w-72" description="w-[28rem]" wrap />

      <Card className="gap-0 py-0">
        <CardContent className="grid gap-5 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-0.5">
              <SkLine className="w-28" />
              <SkLine className="h-10 w-48" />
            </div>
            <Skeleton className="h-5 w-40 rounded-full" />
          </div>
          <div className="grid gap-1.5">
            <Skeleton className="h-3 rounded-full" />
            <div className="flex justify-between">
              <SkLine className="h-4 w-4" />
              <SkLine className="h-4 w-28" />
            </div>
          </div>
        </CardContent>
        <div className="grid border-t sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkStat key={i} value="h-7 w-28" className={i > 0 ? "border-t sm:border-t-0 sm:border-l" : undefined} />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title="w-40" />
          <CardContent className="grid">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-b py-3 last:border-0">
                <div className="grid min-w-0 flex-1">
                  <SkLine className="w-32" />
                  <SkLine className="h-4 w-40" />
                </div>
                <SkLine className="w-20" />
                <Skeleton className="size-4 rounded-sm" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHead title="w-36" />
          <CardContent className="grid gap-3">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border p-4">
                <Skeleton className="mt-0.5 size-4 rounded-full" />
                <div className="grid flex-1 gap-2.5">
                  <div className="grid">
                    <SkLine className="w-44" />
                    <SkLine className="h-4 w-64" />
                  </div>
                  <Skeleton className="h-9 w-52 rounded-lg" />
                </div>
              </div>
            ))}
            <Skeleton className="h-9 w-20 justify-self-end rounded-lg" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="grid gap-1">
          <SkLine className="h-[22px] w-64" />
          <SkLine className="w-80" />
        </CardHeader>
        <CardContent>
          <SkChart />
        </CardContent>
      </Card>
    </SkPage>
  )
}

import { SkLine, SkPage, SkTitle } from "@/components/skeletons"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <SkPage className="grid gap-5">
      <SkTitle title="w-72" description="w-[28rem]" wrap actions={["w-40", "w-32"]} />

      <Card className="gap-2 px-5 py-4">
        <SkLine className="h-4 w-56" />
        <div className="flex flex-wrap items-center gap-2">
          {["w-24", "w-40", "w-36", "w-28"].map((w, i) => (
            <Skeleton key={i} className={`h-5 rounded-full ${w}`} />
          ))}
        </div>
      </Card>

      <Card className="gap-0 py-0">
        <div className="flex h-10 items-center gap-3 border-b px-4">
          <SkLine className="w-6" />
          <SkLine className="ml-4 w-20" />
        </div>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex h-[49px] items-center gap-3 border-b px-4 last:border-0">
            <SkLine className="w-6" />
            <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-4">
              <SkLine className="w-16" />
              <Skeleton className="h-6 w-28 rounded" />
            </div>
            <SkLine className="hidden w-48 md:flex" />
            <Skeleton className="hidden h-5 w-9 rounded-full md:block" />
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="size-7 rounded-md" />
          </div>
        ))}
      </Card>
    </SkPage>
  )
}

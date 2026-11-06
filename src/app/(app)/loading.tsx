import { SkButton, SkCardHeader, SkChart, SkLine, SkPage, SkRow, SkTabs, SkTxRow } from "@/components/skeletons"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

// Dashboard (espelha page.tsx). O banco serverless pode estar acordando: o esqueleto aparece na hora.
export default function Loading() {
  return (
    <SkPage>
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <SkLine className="h-8 w-40" />
          <SkLine className="w-64" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SkButton className="w-36" />
          <SkButton className="w-24" />
        </div>
      </div>

      <Card className="gap-0 py-6">
        <CardContent className="grid gap-5 px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-1">
              <SkLine className="w-32" />
              <SkLine className="h-9 w-56" />
              <SkLine className="h-4 w-72" />
            </div>
            <SkTabs items={["w-11", "w-11", "w-11"]} item="h-7" />
          </div>
          <SkChart className="h-[240px]" />
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="gap-3">
            <CardContent className="flex items-start justify-between gap-2">
              <div className="grid min-w-0 gap-1">
                <SkLine className="w-20" />
                <SkLine className="h-7 w-28" />
              </div>
              <Skeleton className="hidden size-10 rounded-full sm:block" />
            </CardContent>
            <CardContent>
              <SkLine className="h-4 w-36" />
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SkCardHeader title="w-32" right="h-4 w-28" />
          <CardContent className="grid gap-1">
            {Array.from({ length: 4 }, (_, i) => (
              <SkRow key={i} className="py-2" title="w-28" sub={false} right="h-9 w-20" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <SkCardHeader title="w-44" right="w-14" />
          <CardContent className="grid justify-items-center gap-4">
            <Skeleton className="aspect-[2] w-full max-w-60 rounded-t-full opacity-60" />
            <div className="grid w-full grid-cols-3 gap-1">
              {Array.from({ length: 3 }, (_, i) => (
                <SkLine key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <SkCardHeader title="w-40" />
          <CardContent>
            <SkChart legend />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card className="content-start gap-0 overflow-hidden pb-0">
          <SkCardHeader title="w-40" right="w-16" className="pb-3" />
          <div className="border-t">
            {Array.from({ length: 6 }, (_, i) => (
              <SkTxRow key={i} w={["w-40", "w-32", "w-44", "w-28", "w-36", "w-32"][i]} />
            ))}
          </div>
        </Card>
        <div className="grid content-start gap-4">
          <Card>
            <SkCardHeader title="w-40" />
            <CardContent className="grid gap-0.5">
              {Array.from({ length: 2 }, (_, i) => (
                <SkRow key={i} className="py-2" icon="size-8 rounded-full" title="w-44" sub="w-32" right={false} />
              ))}
            </CardContent>
          </Card>
          <Card>
            <SkCardHeader title="w-16" right="w-16" />
            <CardContent className="grid gap-5">
              {Array.from({ length: 2 }, (_, i) => (
                <div key={i} className="grid gap-2">
                  <SkLine className="w-32" />
                  <Skeleton className="h-2 rounded-full" />
                  <SkLine className="h-4 w-40" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </SkPage>
  )
}

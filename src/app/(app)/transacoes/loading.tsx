import { SkChips, SkLine, SkPage, SkTitle, SkTxDays } from "@/components/skeletons"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const DESC = ["w-56", "w-40", "w-48", "w-36", "w-52", "w-44"]

export default function Loading() {
  return (
    <SkPage>
      <SkTitle title="w-40" description="w-64" actions={["w-32", "w-36 max-md:hidden"]} />

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 min-w-0 flex-1 rounded-lg sm:max-w-72" />
        <Skeleton className="h-8 w-36 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>

      <div className="-mx-4 flex gap-2 overflow-hidden px-4 md:mx-0 md:px-0">
        <SkChips items={["w-16", "w-36", "w-28", "w-24", "w-28"]} />
      </div>

      {/* Desktop: a mesma tabela (colunas e alturas) agrupada por dia */}
      <Card className="hidden gap-0 py-0 md:flex">
        <div className="overflow-hidden">
          <table className="w-full min-w-[860px] table-fixed text-sm">
            <colgroup>
              <col className="w-12" />
              <col />
              <col className="w-60" />
              <col className="w-48" />
              <col className="w-32" />
              <col className="w-12" />
            </colgroup>
            <thead>
              <tr className="border-b">
                <th className="h-10 pl-4"><Skeleton className="size-4 rounded-sm" /></th>
                <th className="px-3"><SkLine className="w-20" /></th>
                <th className="px-3"><SkLine className="w-20" /></th>
                <th className="px-3"><SkLine className="w-12" /></th>
                <th className="px-3"><SkLine className="ml-auto w-12" /></th>
                <th />
              </tr>
            </thead>
            {[3, 3].map((n, d) => (
              <tbody key={d}>
                <tr className="border-b bg-muted/40">
                  <td colSpan={4} className="h-8 px-4"><SkLine className="h-4 w-28" /></td>
                  <td className="px-3"><SkLine className="ml-auto h-4 w-16" /></td>
                  <td />
                </tr>
                {Array.from({ length: n }, (_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="pl-4"><Skeleton className="size-4 rounded-sm" /></td>
                    <td className="px-3 py-2.5"><SkLine className={DESC[d * 3 + i]} /></td>
                    <td className="px-3"><SkLine className="w-36" /></td>
                    <td className="px-3"><SkLine className="w-28" /></td>
                    <td className="px-3"><SkLine className="ml-auto w-20" /></td>
                    <td className="pr-3"><Skeleton className="size-7 rounded-md" /></td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Card>

      {/* Celular: lista agrupada por dia */}
      <div className="md:hidden">
        <SkTxDays days={[3, 4]} />
      </div>
    </SkPage>
  )
}

import { Skeleton } from "@/components/ui/skeleton"

// Esqueleto exibido enquanto a tela carrega (o banco serverless pode estar acordando)
export default function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Carregando">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-48" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-72 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

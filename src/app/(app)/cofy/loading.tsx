import { SkLine, SkPage } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

// Mesma moldura de tela cheia do CofyScreen: lista de conversas à esquerda (desktop), conversa e campo de mensagem
export default function Loading() {
  return (
    <SkPage className="-mx-4 -mt-4 -mb-24 flex h-[calc(100svh-3.5rem-var(--demo-bar,0px))] min-h-0 md:-mx-6 md:-mt-6 md:-mb-12">
      <aside className="hidden w-72 shrink-0 border-r bg-card md:block lg:w-[18.5rem]">
        <div className="grid gap-2.5 p-3.5 pb-2">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-8 rounded-full" />
            <SkLine className="w-24" />
          </div>
          <Skeleton className="h-9 rounded-lg" />
        </div>
        <div className="grid gap-1 px-2 pt-2">
          {["w-40", "w-32", "w-44", "w-36", "w-28"].map((w, i) => (
            <SkLine key={i} className={`h-9 px-2 ${w}`} />
          ))}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col max-md:pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-6">
          <Skeleton className="size-8 rounded-lg md:hidden" />
          <SkLine className="w-40" />
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6">
          <Skeleton className="h-11 w-56 self-end rounded-[18px] rounded-br-md" />
          <div className="flex items-start gap-3">
            <Skeleton className="mt-0.5 size-8 shrink-0 rounded-full" />
            <div className="grid flex-1">
              <SkLine className="h-[22px] w-full" />
              <SkLine className="h-[22px] w-4/5" />
              <SkLine className="h-[22px] w-3/5" />
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-3xl px-4 pb-4 sm:px-6">
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      </section>
    </SkPage>
  )
}

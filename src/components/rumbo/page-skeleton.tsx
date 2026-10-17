import { Skeleton } from "@/components/ui/skeleton"

export function PageSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-14">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-4 h-28 w-full rounded-2xl" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </main>
  )
}

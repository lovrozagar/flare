import { Skeleton } from "flare-ui/skeleton"

export default function SkeletonRoute() {
  return (
    <div class="space-y-4">
      <Skeleton class="h-4 w-[250px]" />
      <Skeleton class="h-4 w-[200px]" />
      <Skeleton class="h-4 w-[150px]" />
      <Skeleton class="h-12 w-12 rounded-full" />
    </div>
  )
}

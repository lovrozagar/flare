import { Spinner } from "flare-ui/spinner"

export default function SpinnerRoute() {
  return (
    <div class="flex gap-4 items-center">
      <Spinner class="size-4" aria-label="Loading small" />
      <Spinner class="size-6" aria-label="Loading medium" />
      <Spinner class="size-8" aria-label="Loading large" />
    </div>
  )
}

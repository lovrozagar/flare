import { Progress as BaseProgress } from "@solidports/base-ui/progress"
import { mergeClass } from "./utils/merge-class.ts"

export type ProgressProps = BaseProgress.Root.Props

export function Progress(props: ProgressProps) {
  return (
    <BaseProgress.Root
      {...props}
      class={mergeClass("relative h-4 w-full overflow-hidden rounded-full bg-secondary", props.class)}
    >
      <BaseProgress.Track class="h-full w-full">
        <BaseProgress.Indicator class="bg-primary h-full w-full flex-1 transition-all" />
      </BaseProgress.Track>
    </BaseProgress.Root>
  )
}

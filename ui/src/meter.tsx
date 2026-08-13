import { Meter as BaseMeter } from "@solidports/base-ui/meter"
import { mergeClass } from "./utils/merge-class.ts"

export type MeterProps = BaseMeter.Root.Props

export function Meter(props: MeterProps) {
  return (
    <BaseMeter.Root
      {...props}
      class={mergeClass("relative h-2 w-full overflow-hidden rounded-full bg-secondary", props.class)}
    >
      <BaseMeter.Track class="h-full w-full">
        <BaseMeter.Indicator class="bg-primary data-[low]:bg-warning data-[critical]:bg-destructive h-full transition-all" />
      </BaseMeter.Track>
    </BaseMeter.Root>
  )
}

import { Switch as BaseSwitch } from "@solidports/base-ui/switch"
import { mergeClass } from "./utils/merge-class.ts"

export type SwitchProps = BaseSwitch.Root.Props

export function Switch(props: SwitchProps) {
  return (
    <BaseSwitch.Root
      {...props}
      class={mergeClass("peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[unchecked]:bg-input", props.class)}
    >
      <BaseSwitch.Thumb class="bg-background pointer-events-none block size-4 rounded-full shadow-lg ring-0 transition-transform data-[checked]:translate-x-4 data-[unchecked]:translate-x-0" />
    </BaseSwitch.Root>
  )
}

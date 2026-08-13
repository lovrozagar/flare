import { Separator as BaseSeparator } from "@solidports/base-ui/separator"
import { mergeClass } from "./utils/merge-class.ts"

export type SeparatorProps = BaseSeparator.Props

export function Separator(props: SeparatorProps) {
  return (
    <BaseSeparator
      {...props}
      class={mergeClass("shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px", props.class)}
    />
  )
}

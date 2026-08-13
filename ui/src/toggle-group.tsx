import { ToggleGroup as BaseToggleGroup } from "@solidports/base-ui/toggle-group"
import { mergeClass } from "./utils/merge-class.ts"

export interface ToggleGroupProps extends BaseToggleGroup.Props<string> {
  variant?: "default" | "outline"
  size?: "default" | "sm" | "lg"
}

export function ToggleGroup(props: ToggleGroupProps) {
  return (
    <BaseToggleGroup
      {...props}
      data-variant={props.variant ?? "default"}
      data-size={props.size ?? "default"}
      class={mergeClass("flex items-center justify-center gap-1", props.class)}
    />
  )
}

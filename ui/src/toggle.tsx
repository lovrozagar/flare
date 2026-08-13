import { Toggle as BaseToggle } from "@solidports/base-ui/toggle"
import { mergeClass } from "./utils/merge-class.ts"

export interface ToggleProps extends BaseToggle.Props<string> {
  variant?: "default" | "outline"
  size?: "default" | "sm" | "lg"
}

export function Toggle(props: ToggleProps) {
  return (
    <BaseToggle
      {...props}
      data-variant={props.variant ?? "default"}
      data-size={props.size ?? "default"}
      class={mergeClass("inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-muted-fg focus-visible:outline-none focus-visible:ring disabled:pointer-events-none data-[pressed]:bg-accent data-[pressed]:text-accent-fg " +
        "data-[variant=outline]:border data-[variant=outline]:border-input data-[variant=outline]:bg-transparent " +
        "data-[size=default]:h-9 data-[size=default]:px-3 " +
        "data-[size=sm]:h-8 data-[size=sm]:px-2 data-[size=sm]:text-xs " +
        "data-[size=lg]:h-10 data-[size=lg]:px-3", props.class)}
    />
  )
}

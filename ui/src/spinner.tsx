import type { JSX } from "solid-js"
import { splitProps } from "solid-js"
import { cn } from "./utils/cn.ts"

export interface SpinnerProps extends JSX.SvgSVGAttributes<SVGSVGElement> {
  class?: string
  "aria-label"?: string
}

export function Spinner(props: SpinnerProps) {
  const [local, rest] = splitProps(props, ["class", "aria-label"])
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-label={local["aria-label"] ?? "Loading"}
      role="status"
      {...rest}
      class={cn("animate-spin text-muted-fg", local.class)}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

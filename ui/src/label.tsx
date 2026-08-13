import type { JSX } from "solid-js"
import { splitProps } from "solid-js"
import { cn } from "./utils/cn.ts"

export type LabelProps = JSX.LabelHTMLAttributes<HTMLLabelElement>

export function Label(props: LabelProps) {
  const [local, rest] = splitProps(props, ["class"])
  return (
    <label
      {...rest}
      class={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", local.class)}
    />
  )
}

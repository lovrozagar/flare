import type { JSX } from "solid-js"
import { splitProps } from "solid-js"
import { cn } from "./utils/cn.ts"

export interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "destructive" | "outline"
}

export function Badge(props: BadgeProps) {
  const [local, rest] = splitProps(props, ["class", "variant"])
  return (
    <span
      {...rest}
      data-variant={local.variant ?? "default"}
      class={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring focus:ring-ring focus:ring-offset-2",
        "data-[variant=default]:bg-primary data-[variant=default]:text-primary-fg",
        "data-[variant=secondary]:bg-secondary data-[variant=secondary]:text-secondary-fg",
        "data-[variant=destructive]:bg-destructive data-[variant=destructive]:text-destructive-fg",
        "data-[variant=outline]:border data-[variant=outline]:border-border data-[variant=outline]:text-foreground",
        local.class,
      )}
    />
  )
}

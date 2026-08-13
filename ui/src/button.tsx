import type { JSX } from "solid-js"
import { splitProps } from "solid-js"
import { cn } from "./utils/cn.ts"

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["class", "variant", "size"])
  return (
    <button
      {...rest}
      data-variant={local.variant ?? "default"}
      data-size={local.size ?? "default"}
      class={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,box-shadow,background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
        "data-[variant=default]:bg-primary data-[variant=default]:text-primary-fg data-[variant=default]:shadow-xs data-[variant=default]:hover:bg-primary/90",
        "data-[variant=secondary]:bg-secondary data-[variant=secondary]:text-secondary-fg data-[variant=secondary]:shadow-xs data-[variant=secondary]:hover:bg-secondary/80",
        "data-[variant=destructive]:bg-destructive data-[variant=destructive]:text-destructive-fg data-[variant=destructive]:shadow-xs data-[variant=destructive]:hover:bg-destructive/90",
        "data-[variant=outline]:border data-[variant=outline]:border-input data-[variant=outline]:bg-background data-[variant=outline]:shadow-xs data-[variant=outline]:hover:bg-accent data-[variant=outline]:hover:text-accent-fg",
        "data-[variant=ghost]:hover:bg-accent data-[variant=ghost]:hover:text-accent-fg",
        "data-[variant=link]:text-primary data-[variant=link]:underline-offset-4 data-[variant=link]:hover:underline",
        "data-[size=default]:h-9 data-[size=default]:px-4 data-[size=default]:py-2",
        "data-[size=sm]:h-8 data-[size=sm]:rounded-md data-[size=sm]:px-3 data-[size=sm]:text-xs",
        "data-[size=lg]:h-10 data-[size=lg]:rounded-md data-[size=lg]:px-6",
        "data-[size=icon]:size-9",
        local.class,
      )}
    />
  )
}

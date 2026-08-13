import type { JSX } from "solid-js"
import { splitProps } from "solid-js"
import { cn } from "./utils/cn.ts"

export interface AlertProps extends JSX.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "destructive"
}

export function Alert(props: AlertProps) {
  const [local, rest] = splitProps(props, ["class", "variant", "children"])
  return (
    <div
      {...rest}
      role="alert"
      data-variant={local.variant ?? "default"}
      class={cn(
        "relative w-full rounded-lg border p-4 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg+div]:translate-y-[-3px] [&:has(svg)]:pl-11",
        "data-[variant=default]:bg-background data-[variant=default]:text-foreground",
        "data-[variant=destructive]:border-destructive/50 data-[variant=destructive]:text-destructive dark:data-[variant=destructive]:border-destructive [&>svg]:data-[variant=destructive]:text-destructive",
        local.class,
      )}
    >
      {local.children}
    </div>
  )
}

export type AlertTitleProps = JSX.HTMLAttributes<HTMLHeadingElement>

export function AlertTitle(props: AlertTitleProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <h5
      {...rest}
      class={cn("mb-1 font-medium leading-none tracking-tight", local.class)}
    >
      {local.children}
    </h5>
  )
}

export type AlertDescriptionProps = JSX.HTMLAttributes<HTMLParagraphElement>

export function AlertDescription(props: AlertDescriptionProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <div
      {...rest}
      class={cn("text-sm [&_p]:leading-relaxed", local.class)}
    >
      {local.children}
    </div>
  )
}

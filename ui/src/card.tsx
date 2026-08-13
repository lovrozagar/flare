import type { JSX } from "solid-js"
import { splitProps } from "solid-js"
import { cn } from "./utils/cn.ts"

export type CardProps = JSX.HTMLAttributes<HTMLDivElement>

export function Card(props: CardProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <div
      {...rest}
      class={cn("bg-card text-card-fg rounded-xl border shadow-xs", local.class)}
    >
      {local.children}
    </div>
  )
}

export type CardHeaderProps = JSX.HTMLAttributes<HTMLDivElement>

export function CardHeader(props: CardHeaderProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <div
      {...rest}
      class={cn("flex flex-col space-y-1.5 p-6", local.class)}
    >
      {local.children}
    </div>
  )
}

export type CardTitleProps = JSX.HTMLAttributes<HTMLHeadingElement>

export function CardTitle(props: CardTitleProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <h3
      {...rest}
      class={cn("font-semibold leading-none tracking-tight", local.class)}
    >
      {local.children}
    </h3>
  )
}

export type CardDescriptionProps = JSX.HTMLAttributes<HTMLParagraphElement>

export function CardDescription(props: CardDescriptionProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <p
      {...rest}
      class={cn("text-sm text-muted-fg", local.class)}
    >
      {local.children}
    </p>
  )
}

export type CardContentProps = JSX.HTMLAttributes<HTMLDivElement>

export function CardContent(props: CardContentProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <div
      {...rest}
      class={cn("p-6 pt-0", local.class)}
    >
      {local.children}
    </div>
  )
}

export type CardFooterProps = JSX.HTMLAttributes<HTMLDivElement>

export function CardFooter(props: CardFooterProps) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <div
      {...rest}
      class={cn("flex items-center p-6 pt-0", local.class)}
    >
      {local.children}
    </div>
  )
}

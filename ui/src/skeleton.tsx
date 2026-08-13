import type { JSX } from "solid-js"
import { splitProps } from "solid-js"
import { cn } from "./utils/cn.ts"

export type SkeletonProps = JSX.HTMLAttributes<HTMLDivElement>

export function Skeleton(props: SkeletonProps) {
  const [local, rest] = splitProps(props, ["class"])
  return (
    <div
      {...rest}
      class={cn("animate-pulse rounded-md bg-muted", local.class)}
    />
  )
}

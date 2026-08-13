import { Avatar as BaseAvatar } from "@solidports/base-ui/avatar"
import { splitProps } from "solid-js"
import { mergeClass } from "./utils/merge-class.ts"

export interface AvatarProps extends BaseAvatar.Root.Props {
}

export function Avatar(props: AvatarProps) {
  const [local, rest] = splitProps(props, ["class"])
  return (
    <BaseAvatar.Root
      {...rest}
      class={mergeClass("relative flex size-10 shrink-0 overflow-hidden rounded-full", local.class)}
    />
  )
}

export interface AvatarImageProps extends BaseAvatar.Image.Props {
}

export function AvatarImage(props: AvatarImageProps) {
  const [local, rest] = splitProps(props, ["class"])
  return (
    <BaseAvatar.Image
      {...rest}
      class={mergeClass("aspect-square size-full", local.class)}
    />
  )
}

export interface AvatarFallbackProps extends BaseAvatar.Fallback.Props {
}

export function AvatarFallback(props: AvatarFallbackProps) {
  const [local, rest] = splitProps(props, ["class"])
  return (
    <BaseAvatar.Fallback
      {...rest}
      class={mergeClass("flex size-full items-center justify-center rounded-full bg-muted text-sm font-medium", local.class)}
    />
  )
}

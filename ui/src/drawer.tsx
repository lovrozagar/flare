import { DrawerPreview as BaseDrawer } from "@solidports/base-ui/drawer"
import { Show } from "solid-js"
import type { JSX } from "solid-js"
import { mergeClass } from "./utils/merge-class.ts"
import { cn } from "./utils/cn.ts"
import { X } from "./icons/x.tsx"

export const Drawer = BaseDrawer.Root
export const DrawerTrigger = BaseDrawer.Trigger
export const DrawerPortal = BaseDrawer.Portal
export const DrawerClose = BaseDrawer.Close
export const DrawerHandle = BaseDrawer.Indent

export type DrawerOverlayProps = BaseDrawer.Backdrop.Props

export function DrawerOverlay(props: DrawerOverlayProps) {
  return (
    <BaseDrawer.Backdrop
      {...props}
      class={mergeClass("fixed inset-0 z-modal bg-black/80 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0", props.class)}
    />
  )
}

export interface DrawerContentProps extends BaseDrawer.Popup.Props {
  withClose?: boolean
}

export function DrawerContent(props: DrawerContentProps) {
  return (
    <BaseDrawer.Portal>
      <DrawerOverlay />
      <BaseDrawer.Popup
        {...props}
        class={mergeClass("fixed inset-x-0 bottom-0 z-modal mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background", props.class)}
      >
        <DrawerHandle class="bg-muted mx-auto mt-4 h-2 w-[100px] rounded-full" />
        {props.children}
        <Show when={props.withClose !== false}>
          <BaseDrawer.Close class="focus:ring-ring absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring focus:outline-none disabled:pointer-events-none">
            <X class="size-4" />
            <span class="sr-only">Close</span>
          </BaseDrawer.Close>
        </Show>
      </BaseDrawer.Popup>
    </BaseDrawer.Portal>
  )
}

export type DrawerHeaderProps = JSX.HTMLAttributes<HTMLDivElement>

export function DrawerHeader(props: DrawerHeaderProps) {
  return (
    <div
      {...props}
      class={cn("grid gap-1.5 p-4 text-center sm:text-left", props.class)}
    />
  )
}

export type DrawerFooterProps = JSX.HTMLAttributes<HTMLDivElement>

export function DrawerFooter(props: DrawerFooterProps) {
  return (
    <div
      {...props}
      class={cn("mt-auto flex flex-col gap-2 p-4", props.class)}
    />
  )
}

export type DrawerTitleProps = BaseDrawer.Title.Props

export function DrawerTitle(props: DrawerTitleProps) {
  return (
    <BaseDrawer.Title
      {...props}
      class={mergeClass("text-lg font-semibold leading-none tracking-tight", props.class)}
    />
  )
}

export type DrawerDescriptionProps = BaseDrawer.Description.Props

export function DrawerDescription(props: DrawerDescriptionProps) {
  return (
    <BaseDrawer.Description
      {...props}
      class={mergeClass("text-sm text-muted-fg", props.class)}
    />
  )
}

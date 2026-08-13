import { Dialog as BaseDialog } from "@solidports/base-ui/dialog"
import { Show } from "solid-js"
import type { JSX } from "solid-js"
import { mergeClass } from "./utils/merge-class.ts"
import { cn } from "./utils/cn.ts"
import { X } from "./icons/x.tsx"

export const Sheet = BaseDialog.Root
export const SheetTrigger = BaseDialog.Trigger
export const SheetPortal = BaseDialog.Portal
export const SheetClose = BaseDialog.Close

export type SheetOverlayProps = BaseDialog.Backdrop.Props

export function SheetOverlay(props: SheetOverlayProps) {
  return (
    <BaseDialog.Backdrop
      {...props}
      class={mergeClass("fixed inset-0 z-modal bg-black/80 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0", props.class)}
    />
  )
}

export interface SheetContentProps extends BaseDialog.Popup.Props {
  side?: "top" | "right" | "bottom" | "left"
  withClose?: boolean
}

export function SheetContent(props: SheetContentProps) {
  return (
    <BaseDialog.Portal>
      <SheetOverlay />
      <BaseDialog.Popup
        {...props}
        data-side={props.side ?? "right"}
        class={mergeClass("fixed z-modal gap-4 bg-background p-6 shadow-lg transition-transform duration-300 ease-in-out " +
          "data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:sm:max-w-sm " +
          "data-[side=right]:data-[starting-style]:translate-x-full data-[side=right]:data-[ending-style]:translate-x-full " +
          "data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:sm:max-w-sm " +
          "data-[side=left]:data-[starting-style]:-translate-x-full data-[side=left]:data-[ending-style]:-translate-x-full " +
          "data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto " +
          "data-[side=top]:data-[starting-style]:-translate-y-full data-[side=top]:data-[ending-style]:-translate-y-full " +
          "data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto " +
          "data-[side=bottom]:data-[starting-style]:translate-y-full data-[side=bottom]:data-[ending-style]:translate-y-full", props.class)}
      >
        {props.children}
        <Show when={props.withClose !== false}>
          <BaseDialog.Close class="focus:ring-ring absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring focus:outline-none disabled:pointer-events-none">
            <X class="size-4" />
            <span class="sr-only">Close</span>
          </BaseDialog.Close>
        </Show>
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  )
}

export type SheetHeaderProps = JSX.HTMLAttributes<HTMLDivElement>

export function SheetHeader(props: SheetHeaderProps) {
  return (
    <div
      {...props}
      class={cn("flex flex-col space-y-2 text-center sm:text-left", props.class)}
    />
  )
}

export type SheetFooterProps = JSX.HTMLAttributes<HTMLDivElement>

export function SheetFooter(props: SheetFooterProps) {
  return (
    <div
      {...props}
      class={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", props.class)}
    />
  )
}

export type SheetTitleProps = BaseDialog.Title.Props

export function SheetTitle(props: SheetTitleProps) {
  return (
    <BaseDialog.Title
      {...props}
      class={mergeClass("text-lg font-semibold text-foreground", props.class)}
    />
  )
}

export type SheetDescriptionProps = BaseDialog.Description.Props

export function SheetDescription(props: SheetDescriptionProps) {
  return (
    <BaseDialog.Description
      {...props}
      class={mergeClass("text-sm text-muted-fg", props.class)}
    />
  )
}

import { Dialog as BaseDialog } from "@solidports/base-ui/dialog"
import { Show } from "solid-js"
import type { JSX } from "solid-js"
import { mergeClass } from "./utils/merge-class.ts"
import { cn } from "./utils/cn.ts"
import { X } from "./icons/x.tsx"

export const Dialog = BaseDialog.Root
export const DialogTrigger = BaseDialog.Trigger
export const DialogPortal = BaseDialog.Portal
export const DialogClose = BaseDialog.Close

export type DialogOverlayProps = BaseDialog.Backdrop.Props

export function DialogOverlay(props: DialogOverlayProps) {
  return (
    <BaseDialog.Backdrop
      {...props}
      class={mergeClass("fixed inset-0 z-modal bg-black/80 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0", props.class)}
    />
  )
}

export interface DialogContentProps extends BaseDialog.Popup.Props {
  withClose?: boolean
}

export function DialogContent(props: DialogContentProps) {
  return (
    <BaseDialog.Portal>
      <DialogOverlay />
      <BaseDialog.Popup
        {...props}
        class={mergeClass("fixed left-[50%] top-[50%] z-modal grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 transition-[opacity,scale,transform] data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95 sm:rounded-lg", props.class)}
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

export type DialogHeaderProps = JSX.HTMLAttributes<HTMLDivElement>

export function DialogHeader(props: DialogHeaderProps) {
  return (
    <div
      {...props}
      class={cn("flex flex-col space-y-1.5 text-center sm:text-left", props.class)}
    />
  )
}

export type DialogFooterProps = JSX.HTMLAttributes<HTMLDivElement>

export function DialogFooter(props: DialogFooterProps) {
  return (
    <div
      {...props}
      class={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", props.class)}
    />
  )
}

export type DialogTitleProps = BaseDialog.Title.Props

export function DialogTitle(props: DialogTitleProps) {
  return (
    <BaseDialog.Title
      {...props}
      class={mergeClass("text-lg font-semibold leading-none tracking-tight", props.class)}
    />
  )
}

export type DialogDescriptionProps = BaseDialog.Description.Props

export function DialogDescription(props: DialogDescriptionProps) {
  return (
    <BaseDialog.Description
      {...props}
      class={mergeClass("text-sm text-muted-fg", props.class)}
    />
  )
}

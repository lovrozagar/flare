import { Dialog as BaseDialog } from "@solidports/base-ui/dialog"
import type { JSX } from "solid-js"
import { mergeClass } from "./utils/merge-class.ts"
import { cn } from "./utils/cn.ts"

export const AlertDialog = BaseDialog.Root
export const AlertDialogTrigger = BaseDialog.Trigger
export const AlertDialogPortal = BaseDialog.Portal
export const AlertDialogClose = BaseDialog.Close

export type AlertDialogOverlayProps = BaseDialog.Backdrop.Props

export function AlertDialogOverlay(props: AlertDialogOverlayProps) {
  return (
    <BaseDialog.Backdrop
      {...props}
      class={mergeClass("fixed inset-0 z-modal bg-black/80 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0", props.class)}
    />
  )
}

export type AlertDialogContentProps = BaseDialog.Popup.Props

export function AlertDialogContent(props: AlertDialogContentProps) {
  return (
    <BaseDialog.Portal>
      <AlertDialogOverlay />
      <BaseDialog.Popup
        {...props}
        class={mergeClass("fixed left-[50%] top-[50%] z-modal grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg transition-[opacity,scale,transform] duration-200 data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95 sm:rounded-lg", props.class)}
      />
    </BaseDialog.Portal>
  )
}

export type AlertDialogHeaderProps = JSX.HTMLAttributes<HTMLDivElement>

export function AlertDialogHeader(props: AlertDialogHeaderProps) {
  return (
    <div
      {...props}
      class={cn("flex flex-col space-y-2 text-center sm:text-left", props.class)}
    />
  )
}

export type AlertDialogFooterProps = JSX.HTMLAttributes<HTMLDivElement>

export function AlertDialogFooter(props: AlertDialogFooterProps) {
  return (
    <div
      {...props}
      class={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", props.class)}
    />
  )
}

export type AlertDialogTitleProps = BaseDialog.Title.Props

export function AlertDialogTitle(props: AlertDialogTitleProps) {
  return (
    <BaseDialog.Title
      {...props}
      class={mergeClass("text-lg font-semibold", props.class)}
    />
  )
}

export type AlertDialogDescriptionProps = BaseDialog.Description.Props

export function AlertDialogDescription(props: AlertDialogDescriptionProps) {
  return (
    <BaseDialog.Description
      {...props}
      class={mergeClass("text-sm text-muted-fg", props.class)}
    />
  )
}

export type AlertDialogActionProps = JSX.ButtonHTMLAttributes<HTMLButtonElement>

export function AlertDialogAction(props: AlertDialogActionProps) {
  return (
    <BaseDialog.Close
      {...(props as BaseDialog.Close.Props)}
      class={cn(
        "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        props.class,
      )}
    />
  )
}

export type AlertDialogCancelProps = JSX.ButtonHTMLAttributes<HTMLButtonElement>

export function AlertDialogCancel(props: AlertDialogCancelProps) {
  return (
    <BaseDialog.Close
      {...(props as BaseDialog.Close.Props)}
      class={cn(
        "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-fg focus-visible:outline-none focus-visible:ring focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        props.class,
      )}
    />
  )
}

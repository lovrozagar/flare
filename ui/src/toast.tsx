import { mergeClass } from "./utils/merge-class.ts"
import { Toast as BaseToast } from "@solidports/base-ui/toast"
import { X } from "./icons/x.tsx"

export const ToastProvider = BaseToast.Provider
export const ToastPortal = BaseToast.Portal
export const ToastViewport = BaseToast.Viewport
export const useToast = BaseToast.useToastManager
export const createToaster = BaseToast.createToastManager

export interface ToastProps extends BaseToast.Root.Props {
  variant?: "default" | "destructive"
}

export function Toast(props: ToastProps) {
  return (
    <BaseToast.Root
      {...props}
      data-variant={props.variant ?? "default"}
      class={mergeClass("group pointer-events-auto relative flex w-full items-center justify-between space-x-2 overflow-hidden rounded-md border p-4 pr-6 shadow-lg transition-all " +
          "data-[variant=default]:bg-background data-[variant=default]:text-foreground " +
          "data-[variant=destructive]:bg-destructive data-[variant=destructive]:text-destructive-fg data-[variant=destructive]:border-destructive " +
          "data-[starting-style]:translate-x-full data-[ending-style]:opacity-0", props.class)}
    />
  )
}

export type ToastTitleProps = BaseToast.Title.Props

export function ToastTitle(props: ToastTitleProps) {
  return (
    <BaseToast.Title
      {...props}
      class={mergeClass("text-sm font-semibold", props.class)}
    />
  )
}

export type ToastDescriptionProps = BaseToast.Description.Props

export function ToastDescription(props: ToastDescriptionProps) {
  return (
    <BaseToast.Description
      {...props}
      class={mergeClass("text-sm opacity-90", props.class)}
    />
  )
}

export type ToastActionProps = BaseToast.Action.Props

export function ToastAction(props: ToastActionProps) {
  return (
    <BaseToast.Action
      {...props}
      class={mergeClass("inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-secondary focus:outline-none focus:ring focus:ring-ring disabled:pointer-events-none disabled:opacity-50", props.class)}
    />
  )
}

export type ToastCloseProps = BaseToast.Close.Props

export function ToastClose(props: ToastCloseProps) {
  return (
    <BaseToast.Close
      {...props}
      class={mergeClass("absolute right-1 top-1 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring focus:ring-ring group-hover:opacity-100", props.class)}
    >
      <X class="size-4" />
    </BaseToast.Close>
  )
}

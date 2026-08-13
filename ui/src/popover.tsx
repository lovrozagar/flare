import { Popover as BasePopover } from "@solidports/base-ui/popover"
import { mergeClass } from "./utils/merge-class.ts"

export const Popover = BasePopover.Root
export const PopoverTrigger = BasePopover.Trigger
export const PopoverPortal = BasePopover.Portal
export const PopoverClose = BasePopover.Close
export const PopoverArrow = BasePopover.Arrow

export type PopoverContentProps = BasePopover.Popup.Props

export function PopoverContent(props: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner>
        <BasePopover.Popup
          {...props}
          class={mergeClass("z-popover w-72 rounded-md border bg-popover p-4 text-popover-fg shadow-md outline-none transition-[opacity,scale] duration-150 data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95 data-[side=bottom]:origin-top data-[side=top]:origin-bottom", props.class)}
        />
      </BasePopover.Positioner>
    </BasePopover.Portal>
  )
}

export type PopoverTitleProps = BasePopover.Title.Props

export function PopoverTitle(props: PopoverTitleProps) {
  return (
    <BasePopover.Title
      {...props}
      class={mergeClass("font-medium", props.class)}
    />
  )
}

export type PopoverDescriptionProps = BasePopover.Description.Props

export function PopoverDescription(props: PopoverDescriptionProps) {
  return (
    <BasePopover.Description
      {...props}
      class={mergeClass("text-sm text-muted-fg", props.class)}
    />
  )
}

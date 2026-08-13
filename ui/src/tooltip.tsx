import { Tooltip as BaseTooltip } from "@solidports/base-ui/tooltip"
import { mergeClass } from "./utils/merge-class.ts"

export const TooltipProvider = BaseTooltip.Provider
export const Tooltip = BaseTooltip.Root
export const TooltipTrigger = BaseTooltip.Trigger
export const TooltipPortal = BaseTooltip.Portal
export const TooltipArrow = BaseTooltip.Arrow

export type TooltipContentProps = BaseTooltip.Popup.Props

export function TooltipContent(props: TooltipContentProps) {
  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner>
        <BaseTooltip.Popup
          {...props}
          class={mergeClass("z-popover overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-fg transition-[opacity,scale] duration-100 data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95 data-[instant]:transition-none", props.class)}
        />
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  )
}

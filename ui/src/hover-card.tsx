import { PreviewCard as BasePreviewCard } from "@solidports/base-ui/preview-card"
import { mergeClass } from "./utils/merge-class.ts"

export const HoverCard = BasePreviewCard.Root
export const HoverCardTrigger = BasePreviewCard.Trigger
export const HoverCardPortal = BasePreviewCard.Portal

export type HoverCardContentProps = BasePreviewCard.Popup.Props

export function HoverCardContent(props: HoverCardContentProps) {
  return (
    <BasePreviewCard.Portal>
      <BasePreviewCard.Positioner>
        <BasePreviewCard.Popup
          {...props}
          class={mergeClass("z-popover w-64 rounded-md border bg-popover p-4 text-popover-fg shadow-md outline-none transition-[opacity,scale] duration-150 data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95", props.class)}
        />
      </BasePreviewCard.Positioner>
    </BasePreviewCard.Portal>
  )
}

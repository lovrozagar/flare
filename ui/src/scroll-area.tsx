import { ScrollArea as BaseScrollArea } from "@solidports/base-ui/scroll-area"
import { mergeClass } from "./utils/merge-class.ts"

export type ScrollAreaProps = BaseScrollArea.Root.Props

export function ScrollArea(props: ScrollAreaProps) {
  return (
    <BaseScrollArea.Root
      {...props}
      class={mergeClass("relative overflow-hidden", props.class)}
    >
      <BaseScrollArea.Viewport class="h-full w-full rounded-[inherit]">
        <BaseScrollArea.Content>{props.children}</BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      <ScrollBar />
      <BaseScrollArea.Corner />
    </BaseScrollArea.Root>
  )
}

export type ScrollBarProps = BaseScrollArea.Scrollbar.Props

export function ScrollBar(props: ScrollBarProps) {
  return (
    <BaseScrollArea.Scrollbar
      {...props}
      class={mergeClass("flex touch-none select-none transition-colors data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5 data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:w-full data-[orientation=horizontal]:flex-col", props.class)}
    >
      <BaseScrollArea.Thumb class="bg-border relative flex-1 rounded-full" />
    </BaseScrollArea.Scrollbar>
  )
}

export type ScrollAreaCornerProps = BaseScrollArea.Corner.Props

export const ScrollAreaCorner = BaseScrollArea.Corner

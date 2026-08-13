import { ContextMenu as BaseContextMenu } from "@solidports/base-ui/context-menu"
import { Menu as BaseMenu } from "@solidports/base-ui/menu"
import type { JSX } from "solid-js"
import { mergeClass } from "./utils/merge-class.ts"
import { cn } from "./utils/cn.ts"
import { Check } from "./icons/check.tsx"
import { Dot } from "./icons/dot.tsx"

export const ContextMenu = BaseContextMenu.Root
export const ContextMenuTrigger = BaseContextMenu.Trigger
export const ContextMenuRadioGroup = BaseMenu.RadioGroup
export const ContextMenuSub = BaseMenu.SubmenuRoot
export const ContextMenuSubTrigger = BaseMenu.SubmenuTrigger

export type ContextMenuContentProps = BaseMenu.Popup.Props

export function ContextMenuContent(props: ContextMenuContentProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner>
        <BaseMenu.Popup
          {...props}
          class={mergeClass("z-popover min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-fg shadow-md transition-[opacity,scale] duration-100 data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95", props.class)}
        />
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

export type ContextMenuItemProps = BaseMenu.Item.Props

export function ContextMenuItem(props: ContextMenuItemProps) {
  return (
    <BaseMenu.Item
      {...props}
      class={mergeClass("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-50", props.class)}
    />
  )
}

export type ContextMenuCheckboxItemProps = BaseMenu.CheckboxItem.Props

export function ContextMenuCheckboxItem(props: ContextMenuCheckboxItemProps) {
  return (
    <BaseMenu.CheckboxItem
      {...props}
      class={mergeClass("relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-50", props.class)}
    >
      <span class="absolute left-2 flex size-3.5 items-center justify-center">
        <BaseMenu.CheckboxItemIndicator>
          <Check class="size-4" />
        </BaseMenu.CheckboxItemIndicator>
      </span>
      {props.children}
    </BaseMenu.CheckboxItem>
  )
}

export type ContextMenuRadioItemProps = BaseMenu.RadioItem.Props

export function ContextMenuRadioItem(props: ContextMenuRadioItemProps) {
  return (
    <BaseMenu.RadioItem
      {...props}
      class={mergeClass("relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-50", props.class)}
    >
      <span class="absolute left-2 flex size-3.5 items-center justify-center">
        <BaseMenu.RadioItemIndicator>
          <Dot class="size-4 fill-current" />
        </BaseMenu.RadioItemIndicator>
      </span>
      {props.children}
    </BaseMenu.RadioItem>
  )
}

export type ContextMenuLabelProps = JSX.HTMLAttributes<HTMLDivElement>

export function ContextMenuLabel(props: ContextMenuLabelProps) {
  return (
    <div
      {...props}
      class={cn("px-2 py-1.5 text-sm font-semibold", props.class)}
    />
  )
}

export type ContextMenuSeparatorProps = JSX.HTMLAttributes<HTMLHRElement>

export function ContextMenuSeparator(props: ContextMenuSeparatorProps) {
  return (
    <hr
      {...props}
      class={cn("-mx-1 my-1 h-px bg-muted", props.class)}
    />
  )
}

export type ContextMenuShortcutProps = JSX.HTMLAttributes<HTMLSpanElement>

export function ContextMenuShortcut(props: ContextMenuShortcutProps) {
  return (
    <span
      {...props}
      class={cn("ml-auto text-xs tracking-widest opacity-60", props.class)}
    />
  )
}

export type ContextMenuSubContentProps = BaseMenu.Popup.Props

export function ContextMenuSubContent(props: ContextMenuSubContentProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner>
        <BaseMenu.Popup
          {...props}
          class={mergeClass("z-popover min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-fg shadow-md transition-[opacity,scale] duration-100 data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95", props.class)}
        />
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

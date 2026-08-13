import { Menu as BaseMenu } from "@solidports/base-ui/menu"
import type { JSX } from "solid-js"
import { mergeClass } from "./utils/merge-class.ts"
import { cn } from "./utils/cn.ts"
import { Check } from "./icons/check.tsx"
import { Dot } from "./icons/dot.tsx"

export const DropdownMenu = BaseMenu.Root
export const DropdownMenuTrigger = BaseMenu.Trigger
export const DropdownMenuPortal = BaseMenu.Portal
export const DropdownMenuRadioGroup = BaseMenu.RadioGroup
export const DropdownMenuSub = BaseMenu.SubmenuRoot
export const DropdownMenuSubTrigger = BaseMenu.SubmenuTrigger

export type DropdownMenuContentProps = BaseMenu.Popup.Props

export function DropdownMenuContent(props: DropdownMenuContentProps) {
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

export type DropdownMenuItemProps = BaseMenu.Item.Props

export function DropdownMenuItem(props: DropdownMenuItemProps) {
  return (
    <BaseMenu.Item
      {...props}
      class={mergeClass("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-50", props.class)}
    />
  )
}

export type DropdownMenuCheckboxItemProps = BaseMenu.CheckboxItem.Props

export function DropdownMenuCheckboxItem(props: DropdownMenuCheckboxItemProps) {
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

export type DropdownMenuRadioItemProps = BaseMenu.RadioItem.Props

export function DropdownMenuRadioItem(props: DropdownMenuRadioItemProps) {
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

export type DropdownMenuLabelProps = JSX.HTMLAttributes<HTMLDivElement>

export function DropdownMenuLabel(props: DropdownMenuLabelProps) {
  return (
    <div
      {...props}
      class={cn("px-2 py-1.5 text-sm font-semibold", props.class)}
    />
  )
}

export type DropdownMenuSeparatorProps = JSX.HTMLAttributes<HTMLHRElement>

export function DropdownMenuSeparator(props: DropdownMenuSeparatorProps) {
  return (
    <hr
      {...props}
      class={cn("-mx-1 my-1 h-px bg-muted", props.class)}
    />
  )
}

export type DropdownMenuShortcutProps = JSX.HTMLAttributes<HTMLSpanElement>

export function DropdownMenuShortcut(props: DropdownMenuShortcutProps) {
  return (
    <span
      {...props}
      class={cn("ml-auto text-xs tracking-widest opacity-60", props.class)}
    />
  )
}

export type DropdownMenuSubContentProps = BaseMenu.Popup.Props

export function DropdownMenuSubContent(props: DropdownMenuSubContentProps) {
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

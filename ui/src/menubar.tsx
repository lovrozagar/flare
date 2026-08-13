import { Menubar as BaseMenubar } from "@solidports/base-ui/menubar"
import { Menu as BaseMenu } from "@solidports/base-ui/menu"
import type { JSX } from "solid-js"
import { mergeClass } from "./utils/merge-class.ts"
import { cn } from "./utils/cn.ts"
import { Check } from "./icons/check.tsx"
import { Dot } from "./icons/dot.tsx"

export const Menubar = BaseMenubar
export const MenubarMenu = BaseMenu.Root
export const MenubarRadioGroup = BaseMenu.RadioGroup
export const MenubarSub = BaseMenu.SubmenuRoot
export const MenubarSubTrigger = BaseMenu.SubmenuTrigger

export type MenubarTriggerProps = BaseMenu.Trigger.Props

export function MenubarTrigger(props: MenubarTriggerProps) {
  return (
    <BaseMenu.Trigger
      {...props}
      class={mergeClass("flex cursor-default select-none items-center rounded-sm px-3 py-1 text-sm font-medium outline-none focus:bg-accent focus:text-accent-fg data-[popup-open]:bg-accent data-[popup-open]:text-accent-fg", props.class)}
    />
  )
}

export type MenubarContentProps = BaseMenu.Popup.Props

export function MenubarContent(props: MenubarContentProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner>
        <BaseMenu.Popup
          {...props}
          class={mergeClass("z-popover min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-fg shadow-md transition-[opacity,scale] duration-100 data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95", props.class)}
        />
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

export type MenubarItemProps = BaseMenu.Item.Props

export function MenubarItem(props: MenubarItemProps) {
  return (
    <BaseMenu.Item
      {...props}
      class={mergeClass("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-50", props.class)}
    />
  )
}

export type MenubarCheckboxItemProps = BaseMenu.CheckboxItem.Props

export function MenubarCheckboxItem(props: MenubarCheckboxItemProps) {
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

export type MenubarRadioItemProps = BaseMenu.RadioItem.Props

export function MenubarRadioItem(props: MenubarRadioItemProps) {
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

export type MenubarLabelProps = JSX.HTMLAttributes<HTMLDivElement>

export function MenubarLabel(props: MenubarLabelProps) {
  return (
    <div
      {...props}
      class={cn("px-2 py-1.5 text-sm font-semibold", props.class)}
    />
  )
}

export type MenubarSeparatorProps = JSX.HTMLAttributes<HTMLHRElement>

export function MenubarSeparator(props: MenubarSeparatorProps) {
  return (
    <hr
      {...props}
      class={cn("-mx-1 my-1 h-px bg-muted", props.class)}
    />
  )
}

export type MenubarShortcutProps = JSX.HTMLAttributes<HTMLSpanElement>

export function MenubarShortcut(props: MenubarShortcutProps) {
  return (
    <span
      {...props}
      class={cn("ml-auto text-xs tracking-widest opacity-60", props.class)}
    />
  )
}

export type MenubarSubContentProps = BaseMenu.Popup.Props

export function MenubarSubContent(props: MenubarSubContentProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner>
        <BaseMenu.Popup
          {...props}
          class={mergeClass("z-popover min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-fg shadow-md transition-[opacity,scale] duration-100 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0", props.class)}
        />
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

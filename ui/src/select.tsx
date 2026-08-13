import { mergeClass } from "./utils/merge-class.ts"
import { cn } from "./utils/cn.ts"
import { Select as BaseSelect } from "@solidports/base-ui/select"
import { ChevronDown } from "./icons/chevron-down.tsx"
import { Check } from "./icons/check.tsx"

export const Select = BaseSelect.Root
export const SelectPortal = BaseSelect.Portal
export const SelectValue = BaseSelect.Value
export const SelectItemText = BaseSelect.ItemText
export const SelectItemIndicator = BaseSelect.ItemIndicator
export const SelectGroup = BaseSelect.Group
export const SelectGroupLabel = BaseSelect.GroupLabel
export const SelectScrollUpButton = BaseSelect.ScrollUpArrow
export const SelectScrollDownButton = BaseSelect.ScrollDownArrow

export type SelectTriggerProps = BaseSelect.Trigger.Props

export function SelectTrigger(props: SelectTriggerProps) {
  return (
    <BaseSelect.Trigger
      {...props}
      class={mergeClass("flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-fg focus:outline-none focus:ring focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 data-[popup-open]:ring data-[popup-open]:ring-ring", props.class)}
    >
      {props.children}
      <BaseSelect.Icon class="ml-auto">
        <ChevronDown class="size-4 opacity-50" />
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  )
}

export type SelectContentProps = BaseSelect.Popup.Props

export function SelectContent(props: SelectContentProps) {
  return (
    <BaseSelect.Portal>
      <BaseSelect.Positioner>
        <BaseSelect.Popup
          {...props}
          class={mergeClass("relative z-popover max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-hidden rounded-md border bg-popover text-popover-fg shadow-md transition-[opacity,scale] duration-150 data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95", props.class)}
        >
          <BaseSelect.List class="p-1">{props.children}</BaseSelect.List>
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  )
}

export type SelectItemProps = BaseSelect.Item.Props

export function SelectItem(props: SelectItemProps) {
  return (
    <BaseSelect.Item
      {...props}
      class={mergeClass("relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg data-[selected]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-50", props.class)}
    >
      <span class="absolute left-2 flex size-3.5 items-center justify-center">
        <BaseSelect.ItemIndicator>
          <Check class="size-4" />
        </BaseSelect.ItemIndicator>
      </span>
      <BaseSelect.ItemText>{props.children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  )
}

export type SelectSeparatorProps = { class?: string }

export function SelectSeparator(props: SelectSeparatorProps) {
  return (
    <span class={cn("-mx-1 my-1 block h-px bg-muted", props.class)} />
  )
}

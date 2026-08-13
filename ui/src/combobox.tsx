import { mergeClass } from "./utils/merge-class.ts"
import { Combobox as BaseCombobox } from "@solidports/base-ui/combobox"
import { ChevronDown } from "./icons/chevron-down.tsx"
import { Check } from "./icons/check.tsx"
import { X } from "./icons/x.tsx"

export const Combobox = BaseCombobox.Root
export const ComboboxValue = BaseCombobox.Value
export const ComboboxLabel = BaseCombobox.Label
export const ComboboxPortal = BaseCombobox.Portal
export const ComboboxBackdrop = BaseCombobox.Backdrop
export const ComboboxArrow = BaseCombobox.Arrow
export const ComboboxStatus = BaseCombobox.Status
export const ComboboxList = BaseCombobox.List
export const ComboboxRow = BaseCombobox.Row
export const ComboboxGroup = BaseCombobox.Group
export const ComboboxGroupLabel = BaseCombobox.GroupLabel
export const ComboboxSeparator = BaseCombobox.Separator
export const ComboboxCollection = BaseCombobox.Collection
export const ComboboxChips = BaseCombobox.Chips
export const ComboboxChip = BaseCombobox.Chip

export type ComboboxInputGroupProps = BaseCombobox.InputGroup.Props

export function ComboboxInputGroup(props: ComboboxInputGroupProps) {
  return (
    <BaseCombobox.InputGroup
      {...props}
      class={mergeClass("flex h-9 w-full items-center rounded-md border border-input bg-transparent shadow-xs transition-colors data-[focused]:ring data-[focused]:ring-ring data-[invalid]:border-destructive data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50", props.class)}
    />
  )
}

export type ComboboxInputProps = BaseCombobox.Input.Props

export function ComboboxInput(props: ComboboxInputProps) {
  return (
    <BaseCombobox.Input
      {...props}
      class={mergeClass("flex-1 bg-transparent px-3 text-base outline-none placeholder:text-muted-fg disabled:cursor-not-allowed md:text-sm", props.class)}
    />
  )
}

export type ComboboxTriggerProps = BaseCombobox.Trigger.Props

export function ComboboxTrigger(props: ComboboxTriggerProps) {
  return (
    <BaseCombobox.Trigger
      {...props}
      class={mergeClass("flex h-9 w-9 items-center justify-center text-muted-fg transition-colors hover:text-foreground data-[popup-open]:rotate-180 data-[disabled]:pointer-events-none data-[disabled]:opacity-50", props.class)}
    >
      {props.children ?? <ChevronDown class="size-4" />}
    </BaseCombobox.Trigger>
  )
}

export type ComboboxIconProps = BaseCombobox.Icon.Props

export function ComboboxIcon(props: ComboboxIconProps) {
  return (
    <BaseCombobox.Icon
      {...props}
      class={mergeClass("flex h-9 w-9 items-center justify-center text-muted-fg", props.class)}
    />
  )
}

export type ComboboxClearProps = BaseCombobox.Clear.Props

export function ComboboxClear(props: ComboboxClearProps) {
  return (
    <BaseCombobox.Clear
      {...props}
      class={mergeClass("flex h-9 w-9 items-center justify-center text-muted-fg transition-colors hover:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", props.class)}
    >
      {props.children ?? <X class="size-4" />}
    </BaseCombobox.Clear>
  )
}

export type ComboboxContentProps = BaseCombobox.Popup.Props

export function ComboboxContent(props: ComboboxContentProps) {
  return (
    <BaseCombobox.Portal>
      <BaseCombobox.Positioner>
        <BaseCombobox.Popup
          {...props}
          class={mergeClass("relative z-popover max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-hidden rounded-md border bg-popover text-popover-fg shadow-md outline-none transition-[opacity,scale,transform] duration-150 data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95 data-[side=bottom]:origin-top data-[side=top]:origin-bottom", props.class)}
        >
          <ComboboxList class="max-h-[inherit] overflow-y-auto p-1">
            {props.children}
          </ComboboxList>
        </BaseCombobox.Popup>
      </BaseCombobox.Positioner>
    </BaseCombobox.Portal>
  )
}

export type ComboboxEmptyProps = BaseCombobox.Empty.Props

export function ComboboxEmpty(props: ComboboxEmptyProps) {
  return (
    <BaseCombobox.Empty
      {...props}
      class={mergeClass("py-6 text-center text-sm text-muted-fg", props.class)}
    />
  )
}

export type ComboboxItemProps = BaseCombobox.Item.Props

export function ComboboxItem(props: ComboboxItemProps) {
  return (
    <BaseCombobox.Item
      {...props}
      class={mergeClass("relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg data-[selected]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-50", props.class)}
    />
  )
}

export type ComboboxItemIndicatorProps = BaseCombobox.ItemIndicator.Props

export function ComboboxItemIndicator(props: ComboboxItemIndicatorProps) {
  return (
    <BaseCombobox.ItemIndicator
      {...props}
      class={mergeClass("absolute left-2 flex size-3.5 items-center justify-center transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0", props.class)}
    >
      {props.children ?? <Check class="size-3.5" />}
    </BaseCombobox.ItemIndicator>
  )
}

export type ComboboxChipRemoveProps = BaseCombobox.ChipRemove.Props

export function ComboboxChipRemove(props: ComboboxChipRemoveProps) {
  return (
    <BaseCombobox.ChipRemove
      {...props}
      class={mergeClass("flex h-3 w-3 items-center justify-center text-muted-fg hover:text-foreground", props.class)}
    >
      {props.children ?? <X class="size-3" />}
    </BaseCombobox.ChipRemove>
  )
}

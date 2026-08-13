import { Autocomplete as BaseAutocomplete } from "@solidports/base-ui/autocomplete"
import { Combobox as BaseCombobox } from "@solidports/base-ui/combobox"
import { mergeClass } from "./utils/merge-class.ts"
import { Check } from "./icons/check.tsx"

export const Autocomplete = BaseAutocomplete.Root
export const AutocompleteValue = BaseAutocomplete.Value
export const AutocompletePortal = BaseCombobox.Portal
export const AutocompleteList = BaseCombobox.List
export const AutocompleteEmpty = BaseCombobox.Empty

export type AutocompleteInputProps = BaseCombobox.Input.Props

export function AutocompleteInput(props: AutocompleteInputProps) {
  return (
    <BaseCombobox.Input
      {...props}
      class={mergeClass("flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-base outline-none placeholder:text-muted-fg focus:ring focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", props.class)}
    />
  )
}

export type AutocompleteContentProps = BaseCombobox.Popup.Props

export function AutocompleteContent(props: AutocompleteContentProps) {
  return (
    <BaseCombobox.Portal>
      <BaseCombobox.Positioner>
        <BaseCombobox.Popup
          {...props}
          class={mergeClass("relative z-popover max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-hidden rounded-md border bg-popover text-popover-fg shadow-md outline-none transition-[opacity,scale,transform] duration-150 data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95 data-[side=bottom]:origin-top data-[side=top]:origin-bottom", props.class)}
        >
          <AutocompleteList class="max-h-[inherit] overflow-y-auto p-1">
            {props.children}
          </AutocompleteList>
        </BaseCombobox.Popup>
      </BaseCombobox.Positioner>
    </BaseCombobox.Portal>
  )
}

export type AutocompleteItemProps = BaseAutocomplete.Item.Props

export function AutocompleteItem(props: AutocompleteItemProps) {
  return (
    <BaseAutocomplete.Item
      {...props}
      class={mergeClass("relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg data-[selected]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-50", props.class)}
    >
      <span class="absolute left-2 flex size-3.5 items-center justify-center opacity-0 data-[selected]:opacity-100">
        <Check class="size-3.5" />
      </span>
      {props.children}
    </BaseAutocomplete.Item>
  )
}

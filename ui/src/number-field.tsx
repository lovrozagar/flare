import { NumberField as BaseNumberField } from "@solidports/base-ui/number-field"
import { mergeClass } from "./utils/merge-class.ts"
import { Minus } from "./icons/minus.tsx"
import { ChevronUp as Plus } from "./icons/chevron-up.tsx"

export const NumberField = BaseNumberField.Root

export type NumberFieldGroupProps = BaseNumberField.Group.Props

export function NumberFieldGroup(props: NumberFieldGroupProps) {
  return (
    <BaseNumberField.Group
      {...props}
      class={mergeClass("flex h-9 w-full items-center rounded-md border border-input bg-transparent shadow-xs has-[:focus-visible]:ring has-[:focus-visible]:ring-ring", props.class)}
    />
  )
}

export type NumberFieldInputProps = BaseNumberField.Input.Props

export function NumberFieldInput(props: NumberFieldInputProps) {
  return (
    <BaseNumberField.Input
      {...props}
      class={mergeClass("flex-1 bg-transparent px-3 text-base text-center focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", props.class)}
    />
  )
}

export type NumberFieldDecrementProps = BaseNumberField.Decrement.Props

export function NumberFieldDecrement(props: NumberFieldDecrementProps) {
  return (
    <BaseNumberField.Decrement
      {...props}
      class={mergeClass("flex h-full w-9 items-center justify-center text-muted-fg transition-colors hover:bg-accent hover:text-accent-fg disabled:pointer-events-none disabled:opacity-50 first:rounded-l-md last:rounded-r-md", props.class)}
    >
      {props.children ?? <Minus class="size-4" />}
    </BaseNumberField.Decrement>
  )
}

export type NumberFieldIncrementProps = BaseNumberField.Increment.Props

export function NumberFieldIncrement(props: NumberFieldIncrementProps) {
  return (
    <BaseNumberField.Increment
      {...props}
      class={mergeClass("flex h-full w-9 items-center justify-center text-muted-fg transition-colors hover:bg-accent hover:text-accent-fg disabled:pointer-events-none disabled:opacity-50 first:rounded-l-md last:rounded-r-md", props.class)}
    >
      {props.children ?? <Plus class="size-4" />}
    </BaseNumberField.Increment>
  )
}

export const NumberFieldScrubArea = BaseNumberField.ScrubArea
export const NumberFieldScrubAreaCursor = BaseNumberField.ScrubAreaCursor

import { Checkbox as BaseCheckbox } from "@solidports/base-ui/checkbox"
import { mergeClass } from "./utils/merge-class.ts"
import { Check } from "./icons/check.tsx"

export type CheckboxProps = BaseCheckbox.Root.Props

export function Checkbox(props: CheckboxProps) {
  return (
    <BaseCheckbox.Root
      {...props}
      class={mergeClass("peer size-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[checked]:text-primary-fg", props.class)}
    >
      <BaseCheckbox.Indicator class="flex items-center justify-center text-current">
        <Check class="size-3.5" />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  )
}

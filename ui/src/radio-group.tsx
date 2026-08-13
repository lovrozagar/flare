import { Radio } from "@solidports/base-ui/radio"
import { RadioGroup as BaseRadioGroup } from "@solidports/base-ui/radio-group"
import { mergeClass } from "./utils/merge-class.ts"
import { Dot } from "./icons/dot.tsx"

export type RadioGroupProps = BaseRadioGroup.Props

export function RadioGroup(props: RadioGroupProps) {
  return (
    <BaseRadioGroup
      {...props}
      class={mergeClass("grid gap-2", props.class)}
    />
  )
}

export type RadioGroupItemProps = Radio.Root.Props

export function RadioGroupItem(props: RadioGroupItemProps) {
  return (
    <Radio.Root
      {...props}
      class={mergeClass("aspect-square size-4 rounded-full border border-primary text-primary shadow focus:outline-none focus-visible:ring focus-visible:ring-ring disabled:opacity-50 data-[checked]:bg-primary", props.class)}
    >
      <Radio.Indicator class="flex items-center justify-center text-current">
        <Dot class="fill-primary size-2.5" />
      </Radio.Indicator>
    </Radio.Root>
  )
}

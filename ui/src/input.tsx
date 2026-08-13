import { Input as BaseInput } from "@solidports/base-ui/input"
import { mergeClass } from "./utils/merge-class.ts"

export type InputProps = BaseInput.Props

export function Input(props: InputProps) {
  return (
    <BaseInput
      {...props}
      class={mergeClass("flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-fg focus-visible:outline-none focus-visible:ring focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm aria-invalid:border-destructive", props.class)}
    />
  )
}

import { mergeClass } from "./utils/merge-class.ts"
import { Form as BaseForm } from "@solidports/base-ui/form"

export type FormProps = BaseForm.Props

export function Form(props: FormProps) {
  return (
    <BaseForm
      {...props}
      class={mergeClass("space-y-4", props.class)}
    />
  )
}

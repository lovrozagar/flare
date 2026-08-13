import { createContext, createUniqueId, useContext } from "solid-js"
import type { JSX, ParentProps } from "solid-js"
import { cn } from "./utils/cn.ts"

interface FieldContextValue {
  fieldId: string
  errorId: string
  descriptionId: string
  invalid: boolean
}

const FieldContext = createContext<FieldContextValue>()

export function useFieldContext() {
  const ctx = useContext(FieldContext)
  if (!ctx) throw new Error("useFieldContext must be used inside FieldRoot")
  return ctx
}

export interface FieldRootProps extends ParentProps {
  invalid?: boolean
  class?: string
}

export function FieldRoot(props: FieldRootProps) {
  const id = createUniqueId()
  return (
    <FieldContext.Provider
      value={{
        descriptionId: `${id}-description`,
        errorId: `${id}-error`,
        fieldId: id,
        get invalid() { return props.invalid ?? false },
      }}
    >
      <div
        data-invalid={props.invalid ? "" : undefined}
        class={cn("space-y-2", props.class)}
      >
        {props.children}
      </div>
    </FieldContext.Provider>
  )
}

export type FieldLabelGroupProps = JSX.HTMLAttributes<HTMLDivElement>

export function FieldLabelGroup(props: FieldLabelGroupProps) {
  return (
    <div
      {...props}
      class={cn("flex items-center gap-2", props.class)}
    />
  )
}

export type FieldLabelProps = JSX.LabelHTMLAttributes<HTMLLabelElement>

export function FieldLabel(props: FieldLabelProps) {
  const ctx = useFieldContext()
  return (
    <label
      {...props}
      for={props.for ?? ctx.fieldId}
      class={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        props.class,
      )}
    />
  )
}

export type FieldDescriptionProps = JSX.HTMLAttributes<HTMLParagraphElement>

export function FieldDescription(props: FieldDescriptionProps) {
  const ctx = useFieldContext()
  return (
    <p
      {...props}
      id={props.id ?? ctx.descriptionId}
      class={cn("text-sm text-muted-fg", props.class)}
    />
  )
}

export type FieldErrorProps = JSX.HTMLAttributes<HTMLParagraphElement>

export function FieldError(props: FieldErrorProps) {
  const ctx = useFieldContext()
  return (
    <p
      {...props}
      id={props.id ?? ctx.errorId}
      role="alert"
      data-invalid={ctx.invalid ? "" : undefined}
      class={cn("text-sm font-medium text-destructive", props.class)}
    />
  )
}

export type FieldMessageProps = JSX.HTMLAttributes<HTMLParagraphElement>

export function FieldMessage(props: FieldMessageProps) {
  return (
    <p
      {...props}
      class={cn("text-sm text-muted-fg", props.class)}
    />
  )
}

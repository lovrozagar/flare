import { Collapsible as BaseCollapsible } from "@solidports/base-ui/collapsible"
import { mergeClass } from "./utils/merge-class.ts"

export const Collapsible = BaseCollapsible.Root
export const CollapsibleTrigger = BaseCollapsible.Trigger

export type CollapsibleContentProps = BaseCollapsible.Panel.Props

export function CollapsibleContent(props: CollapsibleContentProps) {
  return (
    <BaseCollapsible.Panel
      {...props}
      class={mergeClass("overflow-hidden text-sm data-[starting-style]:animate-accordion-down data-[ending-style]:animate-accordion-up", props.class)}
    />
  )
}

import { Accordion as BaseAccordion } from "@solidports/base-ui/accordion"
import { mergeClass } from "./utils/merge-class.ts"
import { ChevronDown } from "./icons/chevron-down.tsx"

export const Accordion = BaseAccordion.Root

export type AccordionItemProps = BaseAccordion.Item.Props

export function AccordionItem(props: AccordionItemProps) {
	return (
		<BaseAccordion.Item
			{...props}
			class={mergeClass("border-border border-b last:border-b-0", props.class)}
		/>
	)
}

export type AccordionTriggerProps = BaseAccordion.Trigger.Props

export function AccordionTrigger(props: AccordionTriggerProps) {
	return (
		<BaseAccordion.Header>
			<BaseAccordion.Trigger
				{...props}
				class={mergeClass(
					"group flex w-full flex-1 items-center justify-between gap-4 py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring focus-visible:ring-ring",
					props.class,
				)}
			>
				{props.children}
				<ChevronDown class="text-muted-fg size-4 shrink-0 transition-transform duration-200 group-data-[panel-open]:rotate-180" />
			</BaseAccordion.Trigger>
		</BaseAccordion.Header>
	)
}

export type AccordionContentProps = BaseAccordion.Panel.Props

export function AccordionContent(props: AccordionContentProps) {
	return (
		<BaseAccordion.Panel
			{...props}
			class={mergeClass(
				"text-muted-fg overflow-hidden text-sm transition-[height] duration-200 ease-out data-[starting-style]:h-0 data-[ending-style]:h-0",
				props.class,
			)}
		>
			<div class="pt-0 pb-4">{props.children}</div>
		</BaseAccordion.Panel>
	)
}

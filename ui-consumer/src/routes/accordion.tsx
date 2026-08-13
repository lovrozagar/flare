import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "flare-ui/accordion"

export default function AccordionRoute() {
  return (
    <div class="p-8 max-w-sm">
      <Accordion collapsible>
        <AccordionItem value="a">
          <AccordionTrigger>What is this?</AccordionTrigger>
          <AccordionContent>This is the accordion content for item A.</AccordionContent>
        </AccordionItem>
        <AccordionItem value="b">
          <AccordionTrigger>How does it work?</AccordionTrigger>
          <AccordionContent>Click the trigger to expand or collapse each panel.</AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

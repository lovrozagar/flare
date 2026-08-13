import { createSignal } from "solid-js"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "flare-ui/collapsible"
import { Button } from "flare-ui/button"

export default function CollapsibleRoute() {
  const [open, setOpen] = createSignal(false)
  return (
    <div class="p-8 max-w-sm">
      <Collapsible open={open()} onOpenChange={setOpen}>
        <CollapsibleTrigger as={Button} variant="outline">Toggle content</CollapsibleTrigger>
        <CollapsibleContent>
          <p class="py-2 text-sm">This content is collapsible.</p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

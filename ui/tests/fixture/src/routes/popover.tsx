import { Popover, PopoverTrigger, PopoverContent } from "flare-ui/popover"
import { Button } from "flare-ui/button"

export default function PopoverRoute() {
  return (
    <Popover>
      <PopoverTrigger render={<Button data-variant="outline">Open popover</Button>} />
      <PopoverContent>
        <p class="text-sm">Popover content here.</p>
      </PopoverContent>
    </Popover>
  )
}

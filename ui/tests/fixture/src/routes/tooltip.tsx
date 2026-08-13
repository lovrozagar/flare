import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "flare-ui/tooltip"
import { Button } from "flare-ui/button"

export default function TooltipRoute() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<Button data-variant="outline">Hover me</Button>} />
        <TooltipContent>Tooltip text</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

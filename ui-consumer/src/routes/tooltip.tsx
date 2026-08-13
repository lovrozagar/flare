import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "flare-ui/tooltip"
import { Button } from "flare-ui/button"

export default function TooltipRoute() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={(props) => <Button data-variant="outline" {...props}>Hover me</Button>} />
        <TooltipContent>Tooltip text</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

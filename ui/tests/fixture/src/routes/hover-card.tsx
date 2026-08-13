import { HoverCard, HoverCardTrigger, HoverCardContent } from "flare-ui/hover-card"

export default function HoverCardRoute() {
  return (
    <HoverCard>
      <HoverCardTrigger>
        <a href="#" class="underline">@shadcn</a>
      </HoverCardTrigger>
      <HoverCardContent>
        <p class="text-sm font-semibold">shadcn</p>
        <p class="text-sm text-muted-fg">Creator of shadcn/ui</p>
      </HoverCardContent>
    </HoverCard>
  )
}

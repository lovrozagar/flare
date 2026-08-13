import { Badge } from "flare-ui/badge"

export default function BadgeRoute() {
  return (
    <div class="flex flex-wrap gap-4">
      <Badge data-variant="default">Default</Badge>
      <Badge data-variant="secondary">Secondary</Badge>
      <Badge data-variant="destructive">Destructive</Badge>
      <Badge data-variant="outline">Outline</Badge>
    </div>
  )
}

import { Separator } from "flare-ui/separator"

export default function SeparatorRoute() {
  return (
    <div class="space-y-4">
      <p>Above</p>
      <Separator />
      <p>Below</p>
      <div class="flex gap-4 items-center h-8">
        <span>Left</span>
        <Separator orientation="vertical" />
        <span>Right</span>
      </div>
    </div>
  )
}

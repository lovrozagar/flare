import { Textarea } from "flare-ui/textarea"

export default function TextareaRoute() {
  return (
    <div class="w-full flex flex-col gap-4 max-w-sm">
      <Textarea placeholder="Default" />
      <Textarea placeholder="Disabled" disabled />
    </div>
  )
}

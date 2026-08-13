import { Toggle } from "flare-ui/toggle"

export default function ToggleRoute() {
  return (
    <div class="flex gap-4">
      <Toggle aria-label="Bold">B</Toggle>
      <Toggle aria-label="Italic" data-variant="outline">I</Toggle>
      <Toggle aria-label="Disabled" disabled>U</Toggle>
    </div>
  )
}

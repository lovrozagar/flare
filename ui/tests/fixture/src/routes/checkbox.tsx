import { Checkbox } from "flare-ui/checkbox"

export default function CheckboxRoute() {
  return (
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-2">
        <Checkbox id="cb1" />
        <label for="cb1">Accept terms</label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox id="cb2" checked disabled />
        <label for="cb2">Checked disabled</label>
      </div>
    </div>
  )
}

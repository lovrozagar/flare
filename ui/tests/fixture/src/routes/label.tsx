import { Label } from "flare-ui/label"

export default function LabelRoute() {
  return (
    <div class="flex flex-col gap-4">
      <Label for="field1">Username</Label>
      <input id="field1" class="border rounded p-1" />
      <Label for="field2">Email</Label>
      <input id="field2" type="email" class="border rounded p-1" />
    </div>
  )
}

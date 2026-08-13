import { Input } from "flare-ui/input"

export default function InputRoute() {
  return (
    <div class="w-full flex flex-col gap-4 max-w-sm">
      <Input placeholder="Default" />
      <Input placeholder="Disabled" disabled />
      <Input placeholder="Invalid" aria-invalid="true" />
    </div>
  )
}

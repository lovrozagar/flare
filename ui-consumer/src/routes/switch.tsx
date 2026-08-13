import { Switch } from "flare-ui/switch"

export default function SwitchRoute() {
  return (
    <div class="flex flex-col gap-4">
      <Switch id="sw1" aria-label="Airplane mode" />
      <Switch id="sw2" checked aria-label="Notifications" />
      <Switch id="sw3" disabled aria-label="Disabled" />
    </div>
  )
}

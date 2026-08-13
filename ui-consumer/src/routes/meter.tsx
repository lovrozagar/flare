import { Meter } from "flare-ui/meter"

export default function MeterRoute() {
  return (
    <div class="w-full flex flex-col gap-4 max-w-sm">
      <Meter value={60} min={0} max={100} aria-label="Storage usage" />
      <Meter value={90} min={0} max={100} aria-label="High usage" />
    </div>
  )
}

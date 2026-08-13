import { ToggleGroup, ToggleGroupItem } from "flare-ui/toggle-group"

export default function ToggleGroupRoute() {
  return (
    <ToggleGroup>
      <ToggleGroupItem value="left" aria-label="Left">L</ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Center">C</ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Right">R</ToggleGroupItem>
    </ToggleGroup>
  )
}

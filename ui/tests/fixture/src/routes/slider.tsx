import { Slider } from "flare-ui/slider"

export default function SliderRoute() {
  return (
    <div class="p-8 max-w-sm">
      <Slider defaultValue={[50]} min={0} max={100} />
    </div>
  )
}

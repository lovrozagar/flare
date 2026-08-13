import { RadioGroup, RadioGroupItem } from "flare-ui/radio-group"

export default function RadioGroupRoute() {
  return (
    <RadioGroup defaultValue="option1" class="flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <RadioGroupItem id="r1" value="option1" />
        <label for="r1">Option 1</label>
      </div>
      <div class="flex items-center gap-2">
        <RadioGroupItem id="r2" value="option2" />
        <label for="r2">Option 2</label>
      </div>
    </RadioGroup>
  )
}

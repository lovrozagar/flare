import { NumberField, NumberFieldGroup, NumberFieldInput, NumberFieldDecrement, NumberFieldIncrement } from "flare-ui/number-field"

export default function NumberFieldRoute() {
  return (
    <div class="flex flex-col gap-4 max-w-xs">
      <NumberField defaultValue={0} aria-label="Quantity">
        <NumberFieldGroup>
          <NumberFieldDecrement />
          <NumberFieldInput />
          <NumberFieldIncrement />
        </NumberFieldGroup>
      </NumberField>
      <NumberField defaultValue={5} min={0} max={10} disabled aria-label="Disabled">
        <NumberFieldGroup>
          <NumberFieldDecrement />
          <NumberFieldInput />
          <NumberFieldIncrement />
        </NumberFieldGroup>
      </NumberField>
    </div>
  )
}

import { FieldRoot, FieldLabel, FieldDescription, FieldError, FieldMessage } from "flare-ui/field"
import { Input } from "flare-ui/input"

export default function FieldRoute() {
  return (
    <div class="flex flex-col gap-6 max-w-sm">
      <FieldRoot>
        <FieldLabel>Username</FieldLabel>
        <Input placeholder="Enter username" />
        <FieldDescription>Must be at least 3 characters.</FieldDescription>
      </FieldRoot>
      <FieldRoot invalid>
        <FieldLabel>Email</FieldLabel>
        <Input placeholder="Enter email" aria-invalid="true" />
        <FieldError>Invalid email address.</FieldError>
      </FieldRoot>
    </div>
  )
}

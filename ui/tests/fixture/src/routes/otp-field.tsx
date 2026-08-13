import { OTPField, OTPFieldInput, OTPFieldGroup, OTPFieldSlot, OTPFieldSeparator } from "flare-ui/otp-field"

export default function OTPFieldRoute() {
  return (
    <div class="flex flex-col gap-4">
      <OTPField maxLength={6} aria-label="One-time password">
        <OTPFieldInput />
        <OTPFieldGroup>
          <OTPFieldSlot />
          <OTPFieldSlot />
          <OTPFieldSlot />
        </OTPFieldGroup>
        <OTPFieldSeparator />
        <OTPFieldGroup>
          <OTPFieldSlot />
          <OTPFieldSlot />
          <OTPFieldSlot />
        </OTPFieldGroup>
      </OTPField>
    </div>
  )
}

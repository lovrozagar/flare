import { OTPField, OTPFieldSlots } from "flare-ui/otp-field"

export default function OTPFieldRoute() {
	return (
		<OTPField length={6} aria-label="One-time password">
			<OTPFieldSlots length={6} class="gap-2" />
		</OTPField>
	)
}

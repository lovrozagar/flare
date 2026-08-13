import { Toggle } from "flare-ui/toggle"
import { ToggleGroup } from "flare-ui/toggle-group"

export default function ToggleGroupRoute() {
	return (
		<ToggleGroup>
			<Toggle value="left" aria-label="Left">
				L
			</Toggle>
			<Toggle value="center" aria-label="Center">
				C
			</Toggle>
			<Toggle value="right" aria-label="Right">
				R
			</Toggle>
		</ToggleGroup>
	)
}

import { createPage } from "flare/page"

export const route = createPage("_root_/styling-css-native").render(() => (
	<main data-testid="styling-css-native">
		<div
			data-testid="css-native-box"
			sx={{ color: "rgb(0, 128, 0)", fontSize: "20px", padding: "12px" }}
		>
			Native CSS Prop
		</div>
		<div
			data-testid="css-native-second"
			sx={{ background: "rgb(255, 255, 0)", border: "2px solid rgb(0, 0, 0)" }}
		>
			Second CSS Prop
		</div>
	</main>
))

import { createPage } from "flare/page"

export const route = createPage("_root_/styling-css-native").render(() => (
	<main data-testid="styling-css-native">
		<div css="color: rgb(0, 128, 0); font-size: 20px; padding: 12px;" data-testid="css-native-box">
			Native CSS Prop
		</div>
		<div
			css="background: rgb(255, 255, 0); border: 2px solid rgb(0, 0, 0);"
			data-testid="css-native-second"
		>
			Second CSS Prop
		</div>
	</main>
))

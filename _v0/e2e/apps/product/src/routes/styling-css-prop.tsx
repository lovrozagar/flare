import { createPage } from "@lovrozagar/flare/page";
import { styles } from "@lovrozagar/flare/styles";

export const route = createPage("_root_/styling-css-prop").render(() => {
	const props = styles("css-box", {
		css: "color: red; font-size: 24px; padding: 16px;",
	});
	return (
		<main data-testid="styling-css-prop">
			<div {...props} data-testid="css-box">
				CSS Prop
			</div>
		</main>
	);
});

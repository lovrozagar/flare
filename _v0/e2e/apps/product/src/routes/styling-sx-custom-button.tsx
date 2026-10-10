import { createPage } from "@lovrozagar/flare/page";
import { SxButton } from "../components/sx-custom/button";

/* Custom Button component — consumer overrides via class, sx, style */
export const route = createPage("_root_/styling-sx-custom-button").render(() => {
	return (
		<main data-testid="styling-sx-custom-button">
			{/* default — base lib styles */}
			<SxButton data-testid="btn-default">Default</SxButton>

			{/* consumer override via style (highest specificity) */}
			<SxButton data-testid="btn-style-override" style={{ "background-color": "rgb(200, 0, 0)" }}>
				Style override
			</SxButton>

			{/* consumer override via class (extra class alongside base) */}
			<SxButton class="consumer-btn-class" data-testid="btn-class-override">
				Class override
			</SxButton>
		</main>
	);
});

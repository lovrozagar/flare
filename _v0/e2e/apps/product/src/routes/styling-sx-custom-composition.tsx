import { createPage } from "@lovrozagar/flare/page";
import { SxCard } from "../components/sx-custom/card";
import { SxButton } from "../components/sx-custom/button";

/* Card wrapping Button — both with sx; verify cascade doesn't collide */
export const route = createPage("_root_/styling-sx-custom-composition").render(() => {
	return (
		<main data-testid="styling-sx-custom-composition">
			<SxCard data-testid="card-outer">
				<p data-testid="card-text" sx={{ color: "rgb(40, 40, 40)", marginBottom: "12px" }}>
					Card body text
				</p>
				<SxButton data-testid="card-btn">Action</SxButton>
			</SxCard>

			{/* Card with consumer style override */}
			<SxCard data-testid="card-override" style={{ "background-color": "rgb(230, 240, 255)" }}>
				<span data-testid="card-override-text">Override card</span>
			</SxCard>
		</main>
	);
});

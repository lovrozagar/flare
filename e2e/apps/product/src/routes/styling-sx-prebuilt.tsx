import { createPage } from "@lovrozagar/flare/page";
import { PrebuiltButton } from "../components/ui-test-prebuilt/button";
import { PrebuiltCard } from "../components/ui-test-prebuilt/card";

/*
 * Mode 2 cross-package test — lib ships pre-extracted CSS in @layer sx.
 * Classes (a1-pb*, a1-pc*) come from ui-test-prebuilt/dist/*.css, NOT from
 * the consumer's flare-global.css. The consumer sx plugin must NOT re-emit them.
 */
export const route = createPage("_root_/styling-sx-prebuilt").render(() => {
	return (
		<main data-testid="styling-sx-prebuilt">
			<PrebuiltCard data-testid="prebuilt-card">
				<PrebuiltButton data-testid="prebuilt-btn">Prebuilt button</PrebuiltButton>
				<PrebuiltButton class="consumer-extra" data-testid="prebuilt-btn-extra">
					With consumer class
				</PrebuiltButton>
			</PrebuiltCard>

			{/* Consumer-authored sx — goes into consumer's flare-global.css */}
			<div data-testid="consumer-sx-box" sx={{ color: "rgb(10, 60, 120)", fontSize: "16px", fontWeight: "600" }}>
				Consumer sx box
			</div>
		</main>
	);
});

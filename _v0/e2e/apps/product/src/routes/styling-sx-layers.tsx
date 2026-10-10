import { createPage } from "@lovrozagar/flare/page";
import { compileSx } from "@lovrozagar/flare/styles";

/* Cascade layers: app-layer sx wins over sx-layer; user.app runtime wins over user.lib; inline wins all */

export const route = createPage("_root_/styling-sx-layers").render(() => {
	/* Runtime user.app layer — highest non-inline layer */
	const { class: runtimeCls } = compileSx({ color: "rgb(0, 128, 0)" }, "user.app");

	return (
		<main data-testid="styling-sx-layers">
			{/* Build-time @layer app sx — via sx prop on consumer element */}
			<div data-testid="sx-layers-app" sx={{ color: "rgb(0, 0, 255)", padding: "16px" }}>
				App layer (sx prop)
			</div>

			{/* Runtime user.app layer via compileSx */}
			<div class={runtimeCls} data-testid="sx-layers-runtime">
				Runtime user.app layer
			</div>

			{/* Inline style always wins */}
			<div
				data-testid="sx-layers-inline"
				style={{ color: "rgb(200, 0, 0)" }}
				sx={{ color: "rgb(0, 0, 255)", padding: "8px" }}
			>
				Inline style wins
			</div>
		</main>
	);
});

import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/styling-cn-static").render(() => (
	<main data-testid="styling-cn-static">
		<div class="p-2 p-8" data-testid="cn-static-pad" />
		<div class="p-2 md:p-8" data-testid="cn-static-keep" />
	</main>
));

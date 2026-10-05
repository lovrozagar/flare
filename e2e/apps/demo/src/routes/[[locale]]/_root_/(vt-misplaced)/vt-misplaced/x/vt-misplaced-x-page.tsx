import { createPage } from "@lovrozagar/flare/page";
import { ViewTransitionBoundary } from "@lovrozagar/flare/view-transition-boundary";

export const route = createPage("[[locale]]/_root_/(vt-misplaced)/vt-misplaced/x").render(() => (
	<ViewTransitionBoundary>
		<h1 data-testid="vt-misplaced-page">Page X</h1>
	</ViewTransitionBoundary>
));

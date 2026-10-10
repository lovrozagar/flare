import { createPage } from "@lovrozagar/flare/page";
import { ViewTransitionBoundary } from "@lovrozagar/flare/view-transition-boundary";

export const route = createPage("[[locale]]/_root_/(vt-misplaced)/vt-misplaced/y").render(() => (
	<ViewTransitionBoundary>
		<h1 data-testid="vt-misplaced-page">Page Y</h1>
	</ViewTransitionBoundary>
));

import { createLayout } from "@lovrozagar/flare/layout";
import { Link } from "@lovrozagar/flare/link";
import { ViewTransitionBoundary } from "@lovrozagar/flare/view-transition-boundary";

/* Misplaced boundaries: around the sidebar (no route content) and inside the page (swapped away). */
export const route = createLayout("[[locale]]/_root_/(vt-misplaced)").render((props) => (
	<div data-testid="vt-misplaced">
		<ViewTransitionBoundary>
			<aside data-testid="vt-misplaced-sidebar">
				<Link data-testid="vt-misplaced-x" params={{ locale: undefined }} to="/[[locale]]/vt-misplaced/x">
					X
				</Link>
				<Link data-testid="vt-misplaced-y" params={{ locale: undefined }} to="/[[locale]]/vt-misplaced/y">
					Y
				</Link>
			</aside>
		</ViewTransitionBoundary>
		<main data-testid="vt-misplaced-main">{props.children}</main>
	</div>
));

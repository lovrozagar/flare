import { createLayout } from "@lovrozagar/flare/layout";
import { Link } from "@lovrozagar/flare/link";
import { ViewTransitionBoundary } from "@lovrozagar/flare/view-transition-boundary";

/* Tabs inside the shell: switching tabs should animate only the tab panel. */
export const route = createLayout("[[locale]]/_root_/(vt)/(tabs)").render((props) => (
	<div data-testid="vt-tabs">
		<nav>
			<Link data-testid="vt-tab-one" params={{ locale: undefined }} to="/[[locale]]/vt-tabbed/one">
				One
			</Link>
			<Link data-testid="vt-tab-two" params={{ locale: undefined }} to="/[[locale]]/vt-tabbed/two">
				Two
			</Link>
		</nav>
		<ViewTransitionBoundary>
			<section data-testid="vt-tab-panel">{props.children}</section>
		</ViewTransitionBoundary>
	</div>
));

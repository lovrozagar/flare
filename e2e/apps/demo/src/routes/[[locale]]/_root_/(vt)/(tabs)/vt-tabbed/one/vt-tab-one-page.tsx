import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("[[locale]]/_root_/(vt)/(tabs)/vt-tabbed/one").render(() => (
	<h2 data-testid="vt-tab">Tab one</h2>
));

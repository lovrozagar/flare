import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("[[locale]]/_root_/(vt)/vt-shell/b").render(() => (
	<h1 data-testid="vt-page">Page B</h1>
));

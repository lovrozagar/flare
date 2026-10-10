import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/offline").render(() => (
	<main data-testid="offline-page">
		<h1>Offline</h1>
	</main>
));

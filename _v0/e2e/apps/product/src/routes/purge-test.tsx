import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/purge-test").render(() => {
	console.log("purge-test:console-log-marker");
	console.debug("purge-test:console-debug-marker");
	return (
		<main data-testid="purge-test-main">
			<h1 data-testid="purge-heading">Purge Test Page</h1>
			<p class="content" data-testid="purge-content">
				This page tests purge behavior.
			</p>
		</main>
	);
});

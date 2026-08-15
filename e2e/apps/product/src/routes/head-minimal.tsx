import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/head-minimal")
	.head(() => ({
		description: "Minimal page with only description",
		robots: { follow: false, index: false },
		title: "Head Minimal",
	}))
	.render(() => (
		<main data-testid="head-minimal">
			<h1>Head Minimal</h1>
			<p>Only title, description, and robots.</p>
		</main>
	));

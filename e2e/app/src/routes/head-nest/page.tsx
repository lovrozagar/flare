import { createPage } from "flare/page"

export const route = createPage("_root_/(head-nest)/head-nest/page")
	.head(() => ({
		title: "Page Title",
	}))
	.render(() => (
		<main data-testid="head-nest-page">
			<h1>Head nest</h1>
		</main>
	))

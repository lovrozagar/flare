import { createPage } from "flare/page"

export const route = createPage("_root_/(head-layout)/head-3-level/head-page")
	.head(() => ({
		description: "Page desc",
		title: "Three Level Head",
	}))
	.render(() => <div data-testid="head-3-page">Three Level</div>)

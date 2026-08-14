import { createPage } from "flare/page"

export const route = createPage("_root_/(layout-catches-child)/layout-catches-child/broken-child")
	.loader(() => {
		throw new Error("child exploded")
	})
	.render(() => <div>no</div>)

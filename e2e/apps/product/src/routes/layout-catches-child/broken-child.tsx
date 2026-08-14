import { createPage } from "flare/page"

export const route = createPage("_root_/(layout-catches-child)/layout-catches-child/broken-child")
	.loader(() => {
		throw new Error("Child broke")
	})
	.render(() => <div>no</div>)

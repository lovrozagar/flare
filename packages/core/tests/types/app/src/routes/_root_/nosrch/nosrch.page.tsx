import { createPage } from "@lovrozagar/flare";

export const route = createPage("_root_/nosrch")
	.input({ searchParams: (): {} => ({}) })
	.render(() => <p>none</p>);

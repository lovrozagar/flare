import { createPage } from "@lovrozagar/flare"

// A second page under the base, which the root's Link and navigate button reach as client navigations; its loader
// makes each of them ask for data, under the base (plan 35).
export const route = createPage("_root_/about")
	.loader(() => ({ title: "About" }))
	.render((props) => <>{props.loaderData.title}</>)

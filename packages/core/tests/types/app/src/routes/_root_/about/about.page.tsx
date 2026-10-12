import { createPage } from "@lovrozagar/flare";

export const route = createPage("_root_/about")
	.loader(() => ({ title: "About" }))
	.render((props) => <h1>{props.loaderData.title}</h1>);

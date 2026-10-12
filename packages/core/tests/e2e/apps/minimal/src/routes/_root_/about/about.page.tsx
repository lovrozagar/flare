import { createPage } from "@lovrozagar/flare";

export const route = createPage("_root_/about")
	.loader(() => ({ title: "About" }))
	.render((props) => <>{String(Reflect.get(Object(props.loaderData), "title"))}</>);

import { createPage } from "@lovrozagar/flare";

export const title = "Home";

export const route = createPage("_root_")
	.loader(({ request }) => request.headers.get("x-sentinel") ?? title)
	.render((props) => String(props.loaderData));

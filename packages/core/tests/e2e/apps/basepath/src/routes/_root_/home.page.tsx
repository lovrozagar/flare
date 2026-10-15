import { createPage } from "@lovrozagar/flare"

export const title = "Home"

// Loader data is an object or nothing. The page prints the sentinel the test sent, else the title.
export const route = createPage("_root_/")
	.loader(({ request }) => ({ sentinel: request.headers.get("x-sentinel") ?? title }))
	.render((props) => <>{String(Reflect.get(Object(props.loaderData), "sentinel"))}</>)

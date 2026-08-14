import { createPage } from "flare/page"

export const route = createPage("_root_/static-cache-test")
	.cache({
		client: { staleTime: 60_000 },
		ssg: true,
	})
	.loader(() => ({
		builtAt: Date.now(),
		message: "This page has ssg: true cache config",
	}))
	.render((props) => (
		<div data-testid="static-cache-test">
			<p data-testid="static-message">{props.loaderData.message}</p>
			<p data-testid="static-built-at">{props.loaderData.builtAt}</p>
		</div>
	))

import { createPage } from "flare/page"

export const route = createPage("_root_/cache-headers-test")
	.cache({
		cdn: {
			maxAge: 300,
			swr: 60,
			tags: ["page", "cache-test"],
		},
	})
	.loader(({ auth }) => ({
		message: "Page with CDN cache config",
		renderedAt: Date.now(),
	}))
	.render((props) => (
		<div data-testid="cache-headers-test">
			<p data-testid="cache-message">{props.loaderData.message}</p>
			<p data-testid="cache-rendered-at">{props.loaderData.renderedAt}</p>
		</div>
	))

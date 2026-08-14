import { createPage } from "flare/page"

export const route = createPage("_root_/catch-all/[...segments]")
	.loader((ctx) => {
		const segments = ctx.location.params.segments
		return {
			count: Array.isArray(segments) ? segments.length : 0,
			joined: Array.isArray(segments) ? segments.join("/") : "",
		}
	})
	.render((props) => (
		<div data-testid="catch-all">
			<p data-testid="catchall-count">{props.loaderData.count}</p>
			<p data-testid="catchall-segments">{props.loaderData.joined}</p>
		</div>
	))

import { createPage } from "flare/page"

let callCount = 0

export const route = createPage("_root_/kv-param-test/[slug]")
	.cache({
		ssr: {
			key: ({ params }) => `kv-param:${params.slug}`,
			staleTime: 5_000,
			tags: ({ params }) => ["kv-param", `kv-param:${params.slug}`],
		},
	})
	.loader(({ location }) => {
		callCount++
		return {
			callCount,
			slug: location.params.slug,
			timestamp: Date.now(),
		}
	})
	.render((props) => (
		<div data-testid="kv-param-test">
			<p data-testid="kv-param-slug">{props.loaderData.slug}</p>
			<p data-testid="kv-param-timestamp">{props.loaderData.timestamp}</p>
			<p data-testid="kv-param-call-count">{props.loaderData.callCount}</p>
		</div>
	))
